"use server";

// Every admin write lands here. Each action:
//   1. re-checks admin rights (never trust that the page was protected)
//   2. validates input with zod
//   3. writes through the admin's session (RLS is the second lock)
//   4. records an audit log entry
//   5. redirects back with a message
// Nothing is cached, so the customer-facing side sees the change on its next request.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

// ── helpers ──────────────────────────────────────────────────
const rupees = z.coerce.number().min(0).max(10_000_000).transform((r) => Math.round(r * 100));
const optRupees = z.preprocess((v) => (v === "" || v == null ? null : v), rupees.nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const text = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 1000) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const uuid = z.string().uuid();

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
  write: (db: Awaited<ReturnType<typeof requireAdmin>>["supabase"], data: z.infer<T>) => PromiseLike<{ error: { message: string; code?: string } | null; data?: unknown }>,
  okMsg: string,
) {
  const { supabase, user } = await requireAdmin();
  const parsed = schema.safeParse(fields(fd));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    back(path, "error", `Check “${first.path.join(".") || "form"}”: ${first.message}`);
  }
  const { error } = await write(supabase, parsed.data);
  if (error) {
    const msg = error.code === "23503"
      ? "This is used by existing bookings. Turn it off instead of deleting it."
      : error.code === "23505"
        ? "That already exists."
        : error.message;
    back(path, "error", msg);
  }
  await supabase.from("audit_logs").insert({
    actor: user.id, action, entity, entity_id: (parsed.data as { id?: string }).id ?? null, after: parsed.data,
  });
  back(path, "ok", okMsg);
}

// ── settings ─────────────────────────────────────────────────
const SettingsSchema = z.object({
  brand_name: text(80),
  tagline: text(160),
  contact_email: optText(200).pipe(z.string().email().nullable()),
  instagram_username: text(60).transform((s) => s.replace(/^@/, "")),
  whatsapp_number: optText(20).pipe(z.string().regex(/^\+?\d{10,15}$/, "use digits, e.g. +919876543210").nullable()),
  timezone: text(60),
  booking_enabled: checkbox,
  advance_percent: z.coerce.number().min(1).max(100),
  buffer_minutes: int(0, 480),
  hold_minutes: int(5, 60),
  min_notice_hours: int(0, 720),
  max_days_ahead: int(1, 365),
  slot_interval_minutes: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])),
  tax_enabled: checkbox,
  tax_label: text(20),
  tax_percent: z.coerce.number().min(0).max(50),
});

export async function saveSettings(fd: FormData) {
  await run(fd, "/admin/settings", SettingsSchema, "settings", "update",
    (db, d) => db.from("settings").update(d).eq("id", 1), "Settings saved. Live now.");
}

// ── services ─────────────────────────────────────────────────
const ServiceSchema = z.object({ name: text(80), description: optText(500), active: checkbox, sort: int(0, 999) });

export async function createService(fd: FormData) {
  await run(fd, "/admin/services", ServiceSchema, "service", "create",
    (db, d) => db.from("services").insert(d), "Shoot type added.");
}
export async function updateService(fd: FormData) {
  await run(fd, "/admin/services", ServiceSchema.extend({ id: uuid }), "service", "update",
    (db, { id, ...d }) => db.from("services").update(d).eq("id", id), "Shoot type saved.");
}
export async function deleteService(fd: FormData) {
  await run(fd, "/admin/services", z.object({ id: uuid }), "service", "delete",
    (db, { id }) => db.from("services").delete().eq("id", id), "Shoot type deleted.");
}

const DurationSchema = z.object({
  service_id: uuid, minutes: int(15, 720), price_paise: rupees, active: checkbox, sort: int(0, 999),
});
export async function createDuration(fd: FormData) {
  await run(fd, "/admin/services", DurationSchema, "duration", "create",
    (db, d) => db.from("service_durations").insert(d), "Duration added.");
}
export async function updateDuration(fd: FormData) {
  await run(fd, "/admin/services", DurationSchema.omit({ service_id: true }).extend({ id: uuid }), "duration", "update",
    (db, { id, ...d }) => db.from("service_durations").update(d).eq("id", id), "Duration saved.");
}
export async function deleteDuration(fd: FormData) {
  await run(fd, "/admin/services", z.object({ id: uuid }), "duration", "delete",
    (db, { id }) => db.from("service_durations").delete().eq("id", id), "Duration deleted.");
}

// ── locations & zones ────────────────────────────────────────
const LocationSchema = z.object({
  setting: z.enum(["indoor", "outdoor"]),
  label: text(80),
  charge_type: z.enum(["included", "fixed", "quote"]),
  amount_paise: rupees,
  uses_zone: checkbox,
  note: optText(300),
  active: checkbox,
  sort: int(0, 999),
});
export async function createLocation(fd: FormData) {
  await run(fd, "/admin/locations", LocationSchema, "location_option", "create",
    (db, d) => db.from("location_options").insert(d), "Location option added.");
}
export async function updateLocation(fd: FormData) {
  await run(fd, "/admin/locations", LocationSchema.extend({ id: uuid }), "location_option", "update",
    (db, { id, ...d }) => db.from("location_options").update(d).eq("id", id), "Location option saved.");
}
export async function deleteLocation(fd: FormData) {
  await run(fd, "/admin/locations", z.object({ id: uuid }), "location_option", "delete",
    (db, { id }) => db.from("location_options").delete().eq("id", id), "Location option deleted.");
}

const ZoneSchema = z.object({
  name: text(80), description: optText(300), charge_paise: rupees, requires_quote: checkbox, active: checkbox, sort: int(0, 999),
});
export async function createZone(fd: FormData) {
  await run(fd, "/admin/locations", ZoneSchema, "zone", "create",
    (db, d) => db.from("location_zones").insert(d), "Area added.");
}
export async function updateZone(fd: FormData) {
  await run(fd, "/admin/locations", ZoneSchema.extend({ id: uuid }), "zone", "update",
    (db, { id, ...d }) => db.from("location_zones").update(d).eq("id", id), "Area saved.");
}
export async function deleteZone(fd: FormData) {
  await run(fd, "/admin/locations", z.object({ id: uuid }), "zone", "delete",
    (db, { id }) => db.from("location_zones").delete().eq("id", id), "Area deleted.");
}

// ── included / not included, extra-charge catalogue ──────────
const InclusionSchema = z.object({ text: text(200), is_included: checkbox, active: checkbox, sort: int(0, 999) });
export async function createInclusion(fd: FormData) {
  await run(fd, "/admin/inclusions", InclusionSchema, "inclusion", "create",
    (db, d) => db.from("inclusions").insert(d), "Line added.");
}
export async function updateInclusion(fd: FormData) {
  await run(fd, "/admin/inclusions", InclusionSchema.extend({ id: uuid }), "inclusion", "update",
    (db, { id, ...d }) => db.from("inclusions").update(d).eq("id", id), "Line saved.");
}
export async function deleteInclusion(fd: FormData) {
  await run(fd, "/admin/inclusions", z.object({ id: uuid }), "inclusion", "delete",
    (db, { id }) => db.from("inclusions").delete().eq("id", id), "Line deleted.");
}

const ChargeItemSchema = z.object({
  name: text(80), description: optText(300), default_amount_paise: optRupees, active: checkbox, sort: int(0, 999),
});
export async function createChargeItem(fd: FormData) {
  await run(fd, "/admin/inclusions", ChargeItemSchema, "charge_item", "create",
    (db, d) => db.from("charge_items").insert(d), "Extra charge type added.");
}
export async function updateChargeItem(fd: FormData) {
  await run(fd, "/admin/inclusions", ChargeItemSchema.extend({ id: uuid }), "charge_item", "update",
    (db, { id, ...d }) => db.from("charge_items").update(d).eq("id", id), "Extra charge type saved.");
}
export async function deleteChargeItem(fd: FormData) {
  await run(fd, "/admin/inclusions", z.object({ id: uuid }), "charge_item", "delete",
    (db, { id }) => db.from("charge_items").delete().eq("id", id), "Extra charge type deleted.");
}

// ── working hours ────────────────────────────────────────────
const time = z.string().regex(/^\d{2}:\d{2}$/, "use HH:MM");
const HoursSchema = z.object({ weekdays: z.string().min(1, "pick at least one day"), start_time: time, end_time: time })
  .refine((d) => d.end_time > d.start_time, { message: "end must be after start", path: ["end_time"] });

export async function addHours(fd: FormData) {
  const days = fd.getAll("weekday").map(String);
  fd.set("weekdays", days.join(","));
  fd.delete("weekday");
  await run(fd, "/admin/hours", HoursSchema, "weekly_hours", "create", async (db, d) => {
    const weekdays = d.weekdays.split(",").map(Number).filter((n) => n >= 0 && n <= 6);
    // refuse windows that overlap an existing window on the same day
    const { data: existing, error } = await db.from("weekly_hours").select("weekday,start_time,end_time").in("weekday", weekdays);
    if (error) return { error };
    const clash = (existing ?? []).find((w) => w.start_time.slice(0, 5) < d.end_time && d.start_time < w.end_time.slice(0, 5));
    if (clash) return { error: { message: `Overlaps an existing window (${clash.start_time.slice(0, 5)}–${clash.end_time.slice(0, 5)}).` } };
    return db.from("weekly_hours").insert(weekdays.map((weekday) => ({ weekday, start_time: d.start_time, end_time: d.end_time })));
  }, "Working hours added.");
}
export async function deleteHours(fd: FormData) {
  await run(fd, "/admin/hours", z.object({ id: uuid }), "weekly_hours", "delete",
    (db, { id }) => db.from("weekly_hours").delete().eq("id", id), "Window removed.");
}

// ── policies (versioned: saving creates a new version) ──────
const PolicySchema = z.object({
  type: z.enum(["cancellation", "rescheduling", "terms", "privacy", "refund"]),
  title: text(120),
  body: text(20000),
});
export async function savePolicy(fd: FormData) {
  await run(fd, "/admin/policies", PolicySchema, "policy", "new_version", async (db, d) => {
    const { data: latest } = await db.from("policies").select("version").eq("type", d.type)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const off = await db.from("policies").update({ active: false }).eq("type", d.type).eq("active", true);
    if (off.error) return off;
    return db.from("policies").insert({ ...d, version: (latest?.version ?? 0) + 1, active: true });
  }, "Policy saved as a new version. Existing bookings keep the version they agreed to.");
}

// ── session ──────────────────────────────────────────────────
export async function signOut() {
  const { supabase } = await requireAdmin();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
