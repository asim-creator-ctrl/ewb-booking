"use server";

// Digital products admin: same shape as ../actions.ts — validate → write
// through the admin's session (RLS is the second lock) → audit log →
// redirect with a flash message. Kept in its own file since products are a
// separate domain from the booking system, mirroring that file's helpers.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const rupees = z.coerce.number().min(0).max(10_000_000).transform((r) => Math.round(r * 100));
const optRupees = z.preprocess((v) => (v === "" || v == null ? null : v), rupees.nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const text = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 3000) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const uuid = z.string().uuid();
const slugField = z.string().trim().toLowerCase().min(1).max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, numbers and hyphens only");

function fields(fd: FormData) {
  const o: Record<string, FormDataEntryValue> = {};
  fd.forEach((v, k) => { if (!k.startsWith("$")) o[k] = v; });
  return o;
}

function back(path: string, kind: "ok" | "error", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

async function run<T extends z.ZodTypeAny>(
  fd: FormData,
  path: string,
  schema: T,
  entity: string,
  action: string,
  write: (db: Awaited<ReturnType<typeof requireAdmin>>["supabase"], data: z.infer<T>) => PromiseLike<{ error: { message: string; code?: string } | null }>,
  okMsg: string,
) {
  const { supabase, user } = await requireAdmin();
  const parsed = schema.safeParse(fields(fd));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    back(path, "error", `Check "${first.path.join(".") || "form"}": ${first.message}`);
  }
  const { error } = await write(supabase, parsed.data);
  if (error) {
    const msg = error.code === "23505" ? "That URL slug is already used by another product." : error.message;
    back(path, "error", msg);
  }
  await supabase.from("audit_logs").insert({
    actor: user.id, action, entity, entity_id: (parsed.data as { id?: string }).id ?? null, after: parsed.data,
  });
  back(path, "ok", okMsg);
}

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// ── create (minimal: name, optional slug, price — the rest is filled in on the edit page) ──
const CreateProductSchema = z.object({
  name: text(120),
  slug: z.string().trim().toLowerCase().max(80).regex(/^[a-z0-9-]*$/, "lowercase letters, numbers and hyphens only").optional(),
  price_paise: rupees,
});

export async function createProduct(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = CreateProductSchema.safeParse(fields(fd));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    back("/admin/products", "error", `Check "${first.path.join(".") || "form"}": ${first.message}`);
  }
  const slug = parsed.data.slug && parsed.data.slug.length > 0 ? parsed.data.slug : slugify(parsed.data.name);
  if (!slug) back("/admin/products", "error", "Could not make a URL slug from that name — add one manually.");

  const { data, error } = await supabase
    .from("products")
    .insert({ name: parsed.data.name, slug, price_paise: parsed.data.price_paise })
    .select("id")
    .single();
  if (error) {
    const msg = error.code === "23505" ? "That URL slug is already used by another product." : error.message;
    back("/admin/products", "error", msg);
  }
  await supabase.from("audit_logs").insert({ actor: user.id, action: "create", entity: "product", entity_id: data!.id, after: parsed.data });
  redirect(`/admin/products/${data!.id}?ok=${encodeURIComponent("Product created — now add the photo, description and file below.")}`);
}

// ── full edit ─────────────────────────────────────────────────
const includesToArray = (v: unknown) => String(v ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

const ProductSchema = z.object({
  name: text(120),
  slug: slugField,
  badge: optText(60),
  short_description: optText(200),
  description: optText(3000),
  includes: z.string().optional().transform(includesToArray),
  price_paise: rupees,
  compare_at_price_paise: optRupees,
  featured: checkbox,
  active: checkbox,
  sort: int(0, 999),
});

export async function updateProduct(fd: FormData) {
  await run(fd, "/admin/products", ProductSchema.extend({ id: uuid }), "product", "update",
    (db, { id, ...d }) => db.from("products").update(d).eq("id", id), "Product saved.");
}

export async function deleteProduct(fd: FormData) {
  await run(fd, "/admin/products", z.object({ id: uuid }), "product", "delete",
    (db, { id }) => db.from("products").delete().eq("id", id), "Product deleted.");
}

// ── cover photo (public site-assets bucket, same as the homepage photo) ──
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadProductThumbnail(fd: FormData) {
  const { user } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) back("/admin/products", "error", "Save the product first, then add a photo.");
  const photo = fd.get("photo");
  if (!(photo instanceof File) || photo.size === 0) back(`/admin/products/${id}`, "error", "Choose a photo first.");
  if (!ALLOWED_IMAGE_TYPES.has(photo.type)) back(`/admin/products/${id}`, "error", "Use a JPG, PNG or WEBP image.");
  if (photo.size > MAX_IMAGE_BYTES) back(`/admin/products/${id}`, "error", "That photo is too large — keep it under 5MB.");

  const { createServiceClient } = await import("@/lib/supabase/service");
  const db = createServiceClient();
  const ext = photo.type.split("/")[1];
  const path = `products/${id}-${Date.now()}.${ext}`;
  const { error: uploadErr } = await db.storage.from("site-assets").upload(path, photo, { contentType: photo.type, upsert: false });
  if (uploadErr) back(`/admin/products/${id}`, "error", "Could not upload that photo. Try again.");

  const { data: pub } = db.storage.from("site-assets").getPublicUrl(path);
  const { error } = await db.from("products").update({ thumbnail_url: pub.publicUrl }).eq("id", id);
  if (error) back(`/admin/products/${id}`, "error", "Uploaded, but couldn't save it. Try again.");
  await db.from("audit_logs").insert({ actor: user.id, action: "update", entity: "product", entity_id: id, after: { thumbnail_url: pub.publicUrl } });
  back(`/admin/products/${id}`, "ok", "Photo updated.");
}

export async function removeProductThumbnail(fd: FormData) {
  const { user } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  const { createServiceClient } = await import("@/lib/supabase/service");
  const db = createServiceClient();
  const { error } = await db.from("products").update({ thumbnail_url: null }).eq("id", id);
  if (error) back(`/admin/products/${id}`, "error", "Could not remove the photo.");
  await db.from("audit_logs").insert({ actor: user.id, action: "update", entity: "product", entity_id: id, after: { thumbnail_url: null } });
  back(`/admin/products/${id}`, "ok", "Photo removed.");
}

// ── the deliverable file (private product-files bucket) ─────────────────
const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_FILE_EXT = new Set(["zip", "rar", "7z"]);

export async function uploadProductFile(fd: FormData) {
  const { user } = await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) back("/admin/products", "error", "Save the product first, then add the file.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(`/admin/products/${id}`, "error", "Choose a file first.");
  if (file.size > MAX_FILE_BYTES) back(`/admin/products/${id}`, "error", "That file is too large — keep it under 500MB.");
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_FILE_EXT.has(ext)) back(`/admin/products/${id}`, "error", "Use a .zip, .rar or .7z file.");

  const { createServiceClient } = await import("@/lib/supabase/service");
  const db = createServiceClient();
  const path = `${id}/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await db.storage.from("product-files").upload(path, file, {
    contentType: file.type || "application/octet-stream", upsert: false,
  });
  if (uploadErr) back(`/admin/products/${id}`, "error", "Could not upload that file. Try again.");

  const patch = { file_path: path, file_name: file.name, file_size_bytes: file.size };
  const { error } = await db.from("products").update(patch).eq("id", id);
  if (error) back(`/admin/products/${id}`, "error", "Uploaded, but couldn't save it. Try again.");
  await db.from("audit_logs").insert({ actor: user.id, action: "update", entity: "product", entity_id: id, after: patch });
  back(`/admin/products/${id}`, "ok", "File uploaded. This is what buyers will receive.");
}
