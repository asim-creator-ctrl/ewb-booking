// What one day looks like. Always live: recomputed from the DB on every call.
import { NextResponse } from "next/server";
import { z } from "zod";
import { addDaysStr, getAvailableSlotsForDate, zonedDateStr, zonedTimeToUtc } from "@/lib/availability";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const Query = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(720),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    date: url.searchParams.get("date"),
    durationMinutes: url.searchParams.get("durationMinutes"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid date or duration" }, { status: 400 });
  const { date, durationMinutes } = parsed.data;
  const empty = (reason: string) =>
    NextResponse.json({ date, slots: [], reason }, { headers: { "Cache-Control": "no-store" } });

  const db = createServiceClient();
  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  if (!settings) return NextResponse.json({ error: "Settings unavailable" }, { status: 500 });
  if (!settings.booking_enabled) return empty("paused");

  const now = new Date();
  const todayStr = zonedDateStr(now, settings.timezone);
  const maxDateStr = zonedDateStr(new Date(now.getTime() + settings.max_days_ahead * 86400000), settings.timezone);
  if (date < todayStr) return empty("past");
  if (date > maxDateStr) return empty("too_far_ahead");

  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const dayStart = zonedTimeToUtc(date, "00:00", settings.timezone).toISOString();
  const dayEnd = zonedTimeToUtc(addDaysStr(date, 1), "00:00", settings.timezone).toISOString();

  const [{ data: weeklyHours }, { data: blocks }, { data: bookings }] = await Promise.all([
    db.from("weekly_hours").select("weekday,start_time,end_time").eq("weekday", weekday),
    db.from("blocks").select("starts_at,ends_at").lt("starts_at", dayEnd).gt("ends_at", dayStart),
    db.from("bookings").select("starts_at,ends_at,buffer_minutes")
      .in("status", ["held", "confirmed", "completed", "closed"])
      .lt("starts_at", dayEnd).gt("ends_at", dayStart),
  ]);

  const slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes, timezone: settings.timezone,
    weeklyHours: weeklyHours ?? [], blocks: blocks ?? [], bookings: bookings ?? [],
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now,
  });

  return NextResponse.json(
    { date, slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
