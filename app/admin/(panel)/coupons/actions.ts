"use server";

// Coupon admin: same shape as ../actions.ts — validate → write through the
// admin's session (RLS is the second lock) → audit log → redirect with a
// flash message. Dates come in as plain YYYY-MM-DD (a coupon is "good
// through this calendar date", not a specific time of day) and are converted
// to the business's own timezone the same way app/admin/(panel)/actions.ts's
// addBlock/blockWholeDay convert a calendar block: valid_from is midnight on
// the start date, valid_until is midnight on the day AFTER the end date, so
// the coupon works right up through the end of its last day.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { addDaysStr, zonedTimeToUtc } from "@/lib/availability";

const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const uuid = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date");
const codeField = z.string().trim().min(2).max(40).transform((s) => s.toUpperCase().replace(/\s+/g, ""));
const percent = z.coerce.number().min(0.01).max(100);

function fields(fd: FormData) {
  const o: Record<string, FormDataEntryValue> = {};
  fd.forEach((v, k) => { if (!k.startsWith("$")) o[k] = v; });
  return o;
}

function back(path: string, kind: "ok" | "error", msg: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);
}

const CouponSchema = z.object({
  code: codeField,
  discount_percent: percent,
  service_ids: z.string().min(1, "choose at least one shoot type").transform((s) => s.split(",").filter(Boolean)),
  valid_from_date: dateOnly,
  valid_until_date: dateOnly,
  active: checkbox,
  auto_apply: checkbox,
}).refine((d) => d.valid_until_date >= d.valid_from_date, { message: "end date must be on or after the start date", path: ["valid_until_date"] });

async function dateRangeUtc(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], fromDate: string, untilDate: string) {
  const { data: settings } = await supabase.from("settings").select("timezone").eq("id", 1).single();
  const tz = settings?.timezone ?? "Asia/Kolkata";
  return {
    valid_from: zonedTimeToUtc(fromDate, "00:00", tz).toISOString(),
    valid_until: zonedTimeToUtc(addDaysStr(untilDate, 1), "00:00", tz).toISOString(),
  };
}

export async function createCoupon(fd: FormData) {
  const ids = fd.getAll("service_ids").map(String);
  fd.set("service_ids", ids.join(","));

  const { supabase, user } = await requireAdmin();
  const parsed = CouponSchema.safeParse(fields(fd));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    back("/admin/coupons", "error", `Check "${first.path.join(".") || "form"}": ${first.message}`);
  }
  const { valid_from_date, valid_until_date, ...rest } = parsed.data;
  const range = await dateRangeUtc(supabase, valid_from_date, valid_until_date);
  const payload = { ...rest, ...range };

  const { error } = await supabase.from("coupons").insert(payload);
  if (error) back("/admin/coupons", "error", error.code === "23505" ? "That coupon code is already used." : error.message);
  await supabase.from("audit_logs").insert({ actor: user.id, action: "create", entity: "coupon", after: payload });
  back("/admin/coupons", "ok", "Coupon added.");
}

export async function updateCoupon(fd: FormData) {
  const ids = fd.getAll("service_ids").map(String);
  fd.set("service_ids", ids.join(","));

  const { supabase, user } = await requireAdmin();
  const parsed = CouponSchema.extend({ id: uuid }).safeParse(fields(fd));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    back("/admin/coupons", "error", `Check "${first.path.join(".") || "form"}": ${first.message}`);
  }
  const { id, valid_from_date, valid_until_date, ...rest } = parsed.data;
  const range = await dateRangeUtc(supabase, valid_from_date, valid_until_date);
  const payload = { ...rest, ...range };

  const { error } = await supabase.from("coupons").update(payload).eq("id", id);
  if (error) back("/admin/coupons", "error", error.code === "23505" ? "That coupon code is already used." : error.message);
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "coupon", entity_id: id, after: payload });
  back("/admin/coupons", "ok", "Coupon saved.");
}

export async function deleteCoupon(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = z.object({ id: uuid }).safeParse(fields(fd));
  if (!parsed.success) back("/admin/coupons", "error", "Invalid coupon.");
  const { error } = await supabase.from("coupons").delete().eq("id", parsed.data.id);
  if (error) back("/admin/coupons", "error", error.message);
  await supabase.from("audit_logs").insert({ actor: user.id, action: "delete", entity: "coupon", entity_id: parsed.data.id });
  back("/admin/coupons", "ok", "Coupon deleted.");
}
