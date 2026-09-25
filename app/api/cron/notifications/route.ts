// Sends whatever's due in the `notifications` table. Vercel's free tier only
// runs its own cron once a day, which is too coarse for a "2 hours before"
// reminder — so this is a plain, secret-protected HTTP endpoint any external
// scheduler (or Vercel's own cron, which sends the same header automatically
// when CRON_SECRET is set) can hit every 10–15 minutes. See the README for
// the free external-scheduler setup.
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { formatLocalDateLong, formatLocalTime, zonedDateStr } from "@/lib/availability";
import { formatINR } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type TemplateCtx = { brand: string; dateLabel: string; timeLabel: string; locationSummary: string; balance: string };

const TEMPLATES: Record<string, (c: TemplateCtx) => { subject: string; html: string }> = {
  reminder_7d: (c) => ({
    subject: `Your shoot with ${c.brand} is coming up`,
    html: `<p>Just a reminder — your shoot with ${c.brand} is on ${c.dateLabel} at ${c.timeLabel}.</p><p>${c.locationSummary}</p>`,
  }),
  reminder_24h: (c) => ({
    subject: `Reminder: your shoot is tomorrow`,
    html: `<p>Your shoot with ${c.brand} is tomorrow, ${c.dateLabel} at ${c.timeLabel}.</p><p>${c.locationSummary}</p>`,
  }),
  reminder_2h: (c) => ({
    subject: `Your shoot starts in about 2 hours`,
    html: `<p>Your shoot starts around ${c.timeLabel} today.</p><p>${c.locationSummary}</p>`,
  }),
  balance_due: (c) => ({
    subject: `Balance due — ${c.brand}`,
    html: `<p>Thanks for the shoot! Your remaining balance is ${c.balance}. I'll be in touch about payment and delivery.</p>`,
  }),
};

type NotificationRow = {
  id: string; recipient: string; template: string;
  bookings: { starts_at: string; ends_at: string; total_paise: number; advance_paise: number; location: unknown } | { starts_at: string; ends_at: string; total_paise: number; advance_paise: number; location: unknown }[] | null;
};

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createServiceClient();
  const { data: settings } = await db.from("settings").select("brand_name, timezone").eq("id", 1).single();
  const { data: due } = await db.from("notifications")
    .select("id, recipient, template, bookings(starts_at, ends_at, total_paise, advance_paise, location)")
    .eq("status", "pending").lte("scheduled_for", new Date().toISOString())
    .limit(50)
    .returns<NotificationRow[]>();

  let sent = 0, failed = 0;
  for (const n of due ?? []) {
    const booking = Array.isArray(n.bookings) ? n.bookings[0] : n.bookings;
    if (!booking) {
      await db.from("notifications").update({ status: "failed", error: "booking not found" }).eq("id", n.id);
      failed++;
      continue;
    }
    const build = TEMPLATES[n.template];
    if (!build || !isEmailConfigured()) {
      await db.from("notifications").update({ status: "failed", error: !build ? "unknown template" : "email not configured" }).eq("id", n.id);
      failed++;
      continue;
    }
    const tz = settings?.timezone ?? "Asia/Kolkata";
    const loc = booking.location as { setting?: string; label?: string; zone?: string | null } | null;
    const ctx: TemplateCtx = {
      brand: settings?.brand_name ?? "EDITORWALABHAIYA",
      dateLabel: formatLocalDateLong(zonedDateStr(new Date(booking.starts_at), tz), tz),
      timeLabel: `${formatLocalTime(booking.starts_at, tz)} – ${formatLocalTime(booking.ends_at, tz)}`,
      locationSummary: loc ? `${loc.setting === "outdoor" ? "Outdoor" : "Indoor"} · ${loc.label ?? ""}${loc.zone ? `, ${loc.zone}` : ""}` : "",
      balance: formatINR(booking.total_paise - booking.advance_paise),
    };
    try {
      const { subject, html } = build(ctx);
      await sendEmail({ to: n.recipient, subject, html });
      await db.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", n.id);
      sent++;
    } catch (e) {
      await db.from("notifications").update({ status: "failed", error: String(e) }).eq("id", n.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, checked: (due ?? []).length, sent, failed });
}
