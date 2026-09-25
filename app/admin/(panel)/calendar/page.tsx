import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { addDaysStr, summarizeRange, zonedTimeToUtc, type RangeRow } from "@/lib/availability";
import { sweepExpiredHolds } from "@/lib/bookings";
import { PageHead } from "@/components/ui";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthMatrix(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(month)}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Marks every local calendar date a [start,end) range touches. */
function markDots(map: Map<string, number>, rows: RangeRow[], tz: string) {
  for (const r of rows) {
    const startLocal = new Date(r.starts_at);
    const endLocal = new Date(new Date(r.ends_at).getTime() - 1);
    const start = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(startLocal);
    const end = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(endLocal);
    let d = start;
    while (d <= end) {
      map.set(d, (map.get(d) ?? 0) + 1);
      d = addDaysStr(d, 1);
    }
  }
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase } = await requireAdmin();
  await sweepExpiredHolds(supabase);
  const { month: monthParam } = await searchParams;
  const now = new Date();
  const [year, month] = (monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`)
    .split("-").map(Number);

  const cells = monthMatrix(year, month);
  const dates = cells.filter((c): c is string => !!c);
  const from = dates[0], to = dates[dates.length - 1];

  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();
  const { data: weeklyHours } = await supabase.from("weekly_hours").select("weekday,start_time,end_time");
  const rangeStart = zonedTimeToUtc(from, "00:00", settings!.timezone).toISOString();
  const rangeEnd = zonedTimeToUtc(addDaysStr(to, 1), "00:00", settings!.timezone).toISOString();
  const { data: blocks } = await supabase.from("blocks").select("starts_at,ends_at").lt("starts_at", rangeEnd).gt("ends_at", rangeStart);
  const { data: bookings } = await supabase.from("bookings").select("starts_at,ends_at,buffer_minutes")
    .in("status", ["held", "confirmed", "completed", "closed"]).lt("starts_at", rangeEnd).gt("ends_at", rangeStart);

  const summary = summarizeRange({
    dates, durationMinutes: 60, timezone: settings!.timezone,
    weeklyHours: weeklyHours ?? [], blocks: blocks ?? [], bookings: bookings ?? [],
    bufferMinutes: settings!.buffer_minutes, slotIntervalMinutes: settings!.slot_interval_minutes,
    minNoticeHours: settings!.min_notice_hours, now,
  });
  const byDate = new Map(summary.map((s) => [s.date, s]));

  const blockDots = new Map<string, number>();
  markDots(blockDots, blocks ?? [], settings!.timezone);
  const bookingDots = new Map<string, number>();
  markDots(bookingDots, bookings ?? [], settings!.timezone);

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: settings!.timezone }).format(now);

  return (
    <>
      <PageHead title="Calendar">
        Working days, blocks and bookings at a glance. Click a day to block time or see what&rsquo;s scheduled.
      </PageHead>

      <div className="mb-6 flex max-w-3xl items-center justify-between">
        <Link href={`/admin/calendar?month=${shiftMonth(year, month, -1)}`} className="btn btn-quiet">&larr; Prev</Link>
        <h2 className="font-display text-2xl">{MONTH_LABELS[month - 1]} {year}</h2>
        <Link href={`/admin/calendar?month=${shiftMonth(year, month, 1)}`} className="btn btn-quiet">Next &rarr;</Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 max-w-3xl text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-safelight" /> free slots</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger" /> blocked time</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> booked</span>
      </div>

      <div className="grid max-w-3xl grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="pb-1 text-center text-xs text-muted">{w}</div>
        ))}
        {cells.map((date, i) =>
          date ? (
            <Link key={date} href={`/admin/calendar/${date}`}
              className={`flex min-h-16 flex-col gap-1 rounded-lg border p-2 text-sm hover:border-muted ${
                date === todayStr ? "border-safelight" : "border-line"
              } ${byDate.get(date)?.closed ? "opacity-50" : ""}`}>
              <span className="font-medium">{Number(date.slice(8))}</span>
              {byDate.get(date)?.closed ? (
                <span className="text-xs text-muted">Closed</span>
              ) : (
                <span className="text-xs text-safelight">{byDate.get(date)?.slotCount} free</span>
              )}
              <span className="mt-auto flex gap-1">
                {!!blockDots.get(date) && <span className="size-1.5 rounded-full bg-danger" aria-label="Has blocked time" />}
                {!!bookingDots.get(date) && <span className="size-1.5 rounded-full bg-ok" aria-label="Has a booking" />}
              </span>
            </Link>
          ) : (
            <div key={"empty-" + i} />
          ),
        )}
      </div>
    </>
  );
}
