// A date range's worth of slot counts in one batch, for a date-strip or calendar.
import { NextResponse } from "next/server";
import { z } from "zod";
import { addDaysStr, listDates, summarizeRange, zonedTimeToUtc } from "@/lib/availability";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMinutes: z.coerce.number().int().min(15).max(720),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = Query.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    durationMinutes: url.searchParams.get("durationMinutes"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  const { from, to, durationMinutes } = parsed.data;
  if (to < from) return NextResponse.json({ error: "to must be on or after from" }, { status: 400 });
  const dates = listDates(from, to);
  if (dates.length > 62) return NextResponse.json({ error: "Range too long (max 62 days)" }, { status: 400 });

  const db = createServiceClient();
  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  if (!settings) return NextResponse.json({ error: "Settings unavailable" }, { status: 500 });

  const rangeStart = zonedTimeToUtc(from, "00:00", settings.timezone).toISOString();
  const rangeEnd = zonedTimeToUtc(addDaysStr(to, 1), "00:00", settings.timezone).toISOString();

  const [{ data: weeklyHours }, { data: blocks }, { data: bookings }] = await Promise.all([
    db.from("weekly_hours").select("weekday,start_time,end_time"),
    db.from("blocks").select("starts_at,ends_at").lt("starts_at", rangeEnd).gt("ends_at", rangeStart),
    db.from("bookings").select("starts_at,ends_at,buffer_minutes")
      .in("status", ["held", "confirmed", "completed", "closed"])
      .lt("starts_at", rangeEnd).gt("ends_at", rangeStart),
  ]);

  const days = summarizeRange({
    dates, durationMinutes, timezone: settings.timezone,
    weeklyHours: weeklyHours ?? [], blocks: blocks ?? [], bookings: bookings ?? [],
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now: new Date(),
  });

  return NextResponse.json({ days }, { headers: { "Cache-Control": "no-store" } });
}
