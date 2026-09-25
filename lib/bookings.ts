// The two operations that turn a browsing customer into a paying one.
//
// createBookingHold: re-validates everything server-side (price, slot,
// terms), reserves the slot as a 'held' booking, and opens a Razorpay order
// for the advance. The DB's own exclusion constraint is the final word on
// double-booking — this function just gives a clean error instead of a raw
// Postgres one when that happens.
//
// confirmBookingByOrderId: called from both the client's post-checkout
// verify call AND the Razorpay webhook, so it's written to be safely
// idempotent — calling it twice for the same payment does nothing harmful.
import "server-only";
import { z } from "zod";
import { createServiceClient } from "./supabase/service";
import { loadBookingConfig } from "./config";
import { calculatePrice } from "./pricing";
import { addDaysStr, getAvailableSlotsForDate, zonedTimeToUtc } from "./availability";
import { createRazorpayOrder } from "./razorpay";
import { onBookingConfirmed } from "./notifications";

type Db = ReturnType<typeof createServiceClient>;

/** Marks any 'held' booking past its hold window as 'expired', freeing the slot. Safe to call often. */
export async function sweepExpiredHolds(db: Db): Promise<void> {
  await db.from("bookings").update({ status: "expired" }).eq("status", "held").lt("hold_expires_at", new Date().toISOString());
}

const HoldInput = z.object({
  serviceId: z.string().uuid(),
  durationId: z.string().uuid(),
  locationOptionId: z.string().uuid(),
  zoneId: z.string().uuid().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotStart: z.string().min(1),
  slotEnd: z.string().min(1),
  address: z.string().max(300).nullish(),
  customer: z.object({
    fullName: z.string().trim().min(1).max(120),
    instagram: z.string().trim().max(60).nullish(),
    whatsapp: z.string().trim().min(8).max(20),
    email: z.string().trim().email().max(200),
    purpose: z.string().trim().max(1000).nullish(),
    referenceLink: z.string().trim().max(500).nullish(),
  }),
  termsAccepted: z.literal(true),
});

export type HoldResult =
  | { ok: true; bookingId: string; razorpayOrderId: string; keyId: string; amountPaise: number; holdExpiresAt: string }
  | { ok: false; error: string; code?: "slot_taken" | "invalid" | "paused" };

export async function createBookingHold(input: unknown): Promise<HoldResult> {
  const parsed = HoldInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details and try again.", code: "invalid" };
  const d = parsed.data;

  const db = createServiceClient();
  const config = await loadBookingConfig();
  if (!config.settings.booking_enabled) return { ok: false, error: "Not accepting new bookings right now.", code: "paused" };

  const location = config.locationOptions.find((l) => l.id === d.locationOptionId);
  const service = config.services.find((s) => s.id === d.serviceId);
  const duration = config.durations.find((dur) => dur.id === d.durationId);
  if (!location || !service || !duration) return { ok: false, error: "That selection is no longer available.", code: "invalid" };

  const quote = calculatePrice(config, {
    serviceId: d.serviceId, durationId: d.durationId, locationOptionId: d.locationOptionId,
    zoneId: location.uses_zone ? d.zoneId : null,
  });
  if (!quote.ok) return { ok: false, error: quote.errors[0] ?? "This can't be booked online — message me instead.", code: "invalid" };

  await sweepExpiredHolds(db);

  // Re-verify the exact slot is still on offer (defense-in-depth before the DB's own guard).
  const weekday = new Date(d.date + "T00:00:00Z").getUTCDay();
  const dayStart = zonedTimeToUtc(d.date, "00:00", config.settings.timezone).toISOString();
  const dayEnd = zonedTimeToUtc(addDaysStr(d.date, 1), "00:00", config.settings.timezone).toISOString();
  const [{ data: weeklyHours }, { data: blocks }, { data: bookings }] = await Promise.all([
    db.from("weekly_hours").select("weekday,start_time,end_time").eq("weekday", weekday),
    db.from("blocks").select("starts_at,ends_at").lt("starts_at", dayEnd).gt("ends_at", dayStart),
    db.from("bookings").select("starts_at,ends_at,buffer_minutes")
      .in("status", ["held", "confirmed", "completed", "closed"]).lt("starts_at", dayEnd).gt("ends_at", dayStart),
  ]);
  const slots = getAvailableSlotsForDate({
    dateStr: d.date, durationMinutes: duration.minutes, timezone: config.settings.timezone,
    weeklyHours: weeklyHours ?? [], blocks: blocks ?? [], bookings: bookings ?? [],
    bufferMinutes: config.settings.buffer_minutes, slotIntervalMinutes: config.settings.slot_interval_minutes,
    minNoticeHours: config.settings.min_notice_hours, now: new Date(),
  });
  const stillFree = slots.some((s) => s.start.toISOString() === new Date(d.slotStart).toISOString());
  if (!stillFree) return { ok: false, error: "That time was just taken. Please pick another.", code: "slot_taken" };

  // Upsert the customer by email.
  const email = d.customer.email.toLowerCase();
  const { data: existing } = await db.from("customers").select("id").eq("email", email).maybeSingle();
  let customerId = existing?.id as string | undefined;
  if (customerId) {
    await db.from("customers").update({ full_name: d.customer.fullName, instagram: d.customer.instagram || null, whatsapp: d.customer.whatsapp }).eq("id", customerId);
  } else {
    const { data: created, error } = await db.from("customers").insert({
      full_name: d.customer.fullName, instagram: d.customer.instagram || null, whatsapp: d.customer.whatsapp, email,
    }).select("id").single();
    if (error || !created) return { ok: false, error: "Could not save your details. Please try again." };
    customerId = created.id;
  }

  const { data: activePolicies } = await db.from("policies").select("id").eq("active", true);
  const holdExpiresAt = new Date(Date.now() + config.settings.hold_minutes * 60000).toISOString();
  const locationSnapshot = {
    setting: location.setting, label: location.label,
    zone: location.uses_zone ? (config.zones.find((z) => z.id === d.zoneId)?.name ?? null) : null,
    address: d.address || null,
  };

  const { data: booking, error: insertErr } = await db.from("bookings").insert({
    customer_id: customerId, service_id: d.serviceId, service_name: service.name,
    duration_minutes: duration.minutes, starts_at: d.slotStart, ends_at: d.slotEnd,
    buffer_minutes: config.settings.buffer_minutes, status: "held", payment_status: "unpaid",
    hold_expires_at: holdExpiresAt, location: locationSnapshot, pricing_snapshot: quote,
    total_paise: quote.total_paise, advance_paise: quote.advance_paise,
    policy_ids: (activePolicies ?? []).map((p) => p.id),
    purpose: d.customer.purpose || null, customer_notes: d.customer.purpose || null,
    reference_link: d.customer.referenceLink || null,
  }).select("id").single();

  if (insertErr || !booking) {
    if (insertErr?.code === "23P01") return { ok: false, error: "That time was just taken. Please pick another.", code: "slot_taken" };
    return { ok: false, error: "Could not reserve that slot. Please try again." };
  }

  try {
    const order = await createRazorpayOrder({ amountPaise: quote.advance_paise, receipt: booking.id, notes: { booking_id: booking.id } });
    await db.from("payments").insert({ booking_id: booking.id, kind: "advance", gateway_order_id: order.id, amount_paise: quote.advance_paise, status: "created" });
    return { ok: true, bookingId: booking.id, razorpayOrderId: order.id, keyId: process.env.RAZORPAY_KEY_ID!, amountPaise: quote.advance_paise, holdExpiresAt };
  } catch {
    // Don't leave a slot reserved for a payment that never got a chance to start.
    await db.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    return { ok: false, error: "Could not start payment. Please try again in a moment." };
  }
}

export type ConfirmResult =
  | { ok: true; bookingId: string; ref: string | null; alreadyConfirmed?: boolean }
  | { ok: false; bookingId?: string; conflict?: boolean; error: string };

/** Idempotent: safe to call more than once for the same order (client verify + webhook both call this). */
export async function confirmBookingByOrderId(db: Db, opts: { gatewayOrderId: string; gatewayPaymentId: string; method?: string }): Promise<ConfirmResult> {
  const { data: payment } = await db.from("payments").select("id, booking_id").eq("gateway_order_id", opts.gatewayOrderId).eq("kind", "advance").maybeSingle();
  if (!payment) return { ok: false, error: "Unknown payment order." };

  await db.from("payments").update({ gateway_payment_id: opts.gatewayPaymentId, status: "captured", method: opts.method ?? null }).eq("id", payment.id);

  const { data: booking } = await db.from("bookings").select("id, status, ref").eq("id", payment.booking_id).single();
  if (!booking) return { ok: false, error: "Unknown booking." };

  if (booking.status === "confirmed") return { ok: true, bookingId: booking.id, ref: booking.ref, alreadyConfirmed: true };
  if (booking.status === "payment_conflict") {
    return { ok: false, bookingId: booking.id, conflict: true, error: "That slot was taken before payment completed. A refund will be issued." };
  }

  if (booking.status === "held" || booking.status === "expired" || booking.status === "cancelled") {
    const { data: ref } = await db.rpc("next_booking_ref");
    const { data: updated } = await db.from("bookings")
      .update({ status: "confirmed", payment_status: "advance_paid", confirmed_at: new Date().toISOString(), ref })
      .eq("id", booking.id).in("status", ["held", "expired", "cancelled"])
      .select("id, ref").maybeSingle();

    if (updated) {
      await onBookingConfirmed(db, updated.id);
      return { ok: true, bookingId: updated.id, ref: updated.ref };
    }

    // The update was blocked — either the DB's exclusion constraint (someone
    // else now holds that time) or another concurrent call already moved this
    // booking on. Either way, re-check reality rather than guess.
    const { data: fresh } = await db.from("bookings").select("id, status, ref").eq("id", booking.id).single();
    if (fresh?.status === "confirmed") return { ok: true, bookingId: fresh.id, ref: fresh.ref, alreadyConfirmed: true };

    await db.from("bookings").update({ status: "payment_conflict" }).eq("id", booking.id);
    return { ok: false, bookingId: booking.id, conflict: true, error: "That slot was taken before payment completed. A refund will be issued." };
  }

  return { ok: false, bookingId: booking.id, error: `Unexpected booking status: ${booking.status}` };
}
