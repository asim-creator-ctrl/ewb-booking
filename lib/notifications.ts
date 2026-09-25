// Fires once, the moment a booking is confirmed (called from
// confirmBookingByOrderId, never directly). Sends your instant alert, emails
// the customer their confirmation with a calendar invite, and schedules the
// future reminder rows for the cron endpoint to pick up later.
//
// Every send here is independently wrapped: a missing Telegram token, a
// misconfigured Gmail password, or a network blip must never surface as a
// failure of the booking itself — the payment already succeeded by the time
// this runs, and that can't be undone by a notification going wrong.
import "server-only";
import { createServiceClient } from "./supabase/service";
import { sendTelegramMessage, isTelegramConfigured } from "./telegram";
import { sendEmail, isEmailConfigured } from "./email";
import { buildBookingICS } from "./ics";
import { formatLocalDateLong, formatLocalTime, zonedDateStr } from "./availability";
import { formatINR } from "./pricing";

type Db = ReturnType<typeof createServiceClient>;

type LocationSnapshot = { setting?: string; label?: string; zone?: string | null; address?: string | null } | null;

function locationSummary(loc: LocationSnapshot): string {
  if (!loc) return "";
  const setting = loc.setting === "outdoor" ? "Outdoor" : "Indoor";
  return `${setting} · ${loc.label ?? ""}${loc.zone ? `, ${loc.zone}` : ""}${loc.address ? ` (${loc.address})` : ""}`;
}

export async function onBookingConfirmed(db: Db, bookingId: string): Promise<void> {
  try {
    const { data: settings } = await db.from("settings").select("brand_name, timezone, whatsapp_number, contact_email").eq("id", 1).single();
    const { data: booking } = await db.from("bookings")
      .select("id, ref, service_name, starts_at, ends_at, total_paise, advance_paise, location, customers(full_name, email, whatsapp)")
      .eq("id", bookingId).single();
    if (!settings || !booking) return;

    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
    if (!customer) return;

    const tz = settings.timezone;
    const dateLabel = formatLocalDateLong(zonedDateStr(new Date(booking.starts_at), tz), tz);
    const timeLabel = `${formatLocalTime(booking.starts_at, tz)} – ${formatLocalTime(booking.ends_at, tz)}`;
    const loc = booking.location as LocationSnapshot;
    const locSummary = locationSummary(loc);
    const balance = booking.total_paise - booking.advance_paise;

    // 1. Instant alert to you.
    const adminLines = [
      "<b>New booking confirmed</b>", booking.ref ?? "", "",
      customer.full_name, booking.service_name, `${dateLabel}, ${timeLabel}`, locSummary, "",
      `Total: ${formatINR(booking.total_paise)}`, `Advance paid: ${formatINR(booking.advance_paise)}`, `Balance: ${formatINR(balance)}`, "",
      `WhatsApp: ${customer.whatsapp}`, `Email: ${customer.email}`,
    ].filter(Boolean).join("\n");

    if (isTelegramConfigured()) {
      try { await sendTelegramMessage(adminLines); } catch (e) { console.error("Telegram admin alert failed:", e); }
    }
    if (isEmailConfigured() && settings.contact_email) {
      try {
        await sendEmail({ to: settings.contact_email, subject: `New booking — ${booking.ref ?? booking.service_name}`, html: adminLines.replace(/\n/g, "<br>") });
      } catch (e) { console.error("Admin email alert failed:", e); }
    }

    // 2. Confirmation email + calendar invite to the customer.
    if (isEmailConfigured()) {
      const ics = buildBookingICS({
        uid: booking.id, summary: `${settings.brand_name} — ${booking.service_name}`,
        description: `Booking ${booking.ref ?? ""}. Total ${formatINR(booking.total_paise)}.`,
        location: locSummary, startISO: booking.starts_at, endISO: booking.ends_at,
        organizerEmail: settings.contact_email ?? undefined,
      });
      const html = `
        <p>Your shoot with ${settings.brand_name} is confirmed${booking.ref ? ` — <b>${booking.ref}</b>` : ""}.</p>
        <p>${booking.service_name}<br>${dateLabel}, ${timeLabel}<br>${locSummary}</p>
        <p>Total: ${formatINR(booking.total_paise)}<br>Advance paid: ${formatINR(booking.advance_paise)}<br>Balance after the shoot: ${formatINR(balance)}</p>
        <p>I'll reach out personally to plan the shoot, the location and anything else we need to sort out beforehand.</p>
      `;
      try {
        await sendEmail({
          to: customer.email, subject: `Booking confirmed — ${settings.brand_name}`, html,
          attachments: [{ filename: "booking.ics", content: ics, contentType: "text/calendar; charset=utf-8; method=PUBLISH" }],
        });
      } catch (e) { console.error("Customer confirmation email failed:", e); }
    }

    // 3. Schedule the future reminders (7d/24h/2h before, balance due after) for the cron endpoint to send later.
    const { data: rules } = await db.from("reminder_rules").select("*").eq("active", true);
    if (rules?.length) {
      const now = Date.now();
      const rows = rules
        .map((r) => {
          const base = r.offset_minutes < 0 ? booking.starts_at : booking.ends_at;
          const scheduledFor = new Date(new Date(base).getTime() + r.offset_minutes * 60000).toISOString();
          return { booking_id: booking.id, channel: r.channel, recipient: customer.email, template: r.template, scheduled_for: scheduledFor };
        })
        .filter((row) => new Date(row.scheduled_for).getTime() > now); // a last-minute booking may already be past some of these
      if (rows.length) await db.from("notifications").insert(rows);
    }
  } catch (e) {
    console.error("onBookingConfirmed failed:", e);
  }
}

/** Fires when a booking's balance is paid (Payment Link webhook, or admin marking it paid manually). */
export async function onBalancePaid(db: Db, bookingId: string): Promise<void> {
  try {
    const { data: settings } = await db.from("settings").select("brand_name, contact_email").eq("id", 1).single();
    const { data: booking } = await db.from("bookings").select("ref, service_name, customers(full_name)").eq("id", bookingId).single();
    if (!settings || !booking) return;
    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
    const msg = ["<b>Balance received</b>", booking.ref ?? "", `${customer?.full_name ?? ""} — ${booking.service_name}`].filter(Boolean).join("\n");

    if (isTelegramConfigured()) {
      try { await sendTelegramMessage(msg); } catch (e) { console.error("Telegram balance alert failed:", e); }
    }
    if (isEmailConfigured() && settings.contact_email) {
      try { await sendEmail({ to: settings.contact_email, subject: `Balance received — ${booking.ref ?? booking.service_name}`, html: msg.replace(/\n/g, "<br>") }); }
      catch (e) { console.error("Admin balance email failed:", e); }
    }
  } catch (e) {
    console.error("onBalancePaid failed:", e);
  }
}
