// Timezone-aware availability engine.
//
// Everything that touches "wall clock time in the business's timezone" goes
// through zonedTimeToUtc/getZonedParts, which compute the zone's offset with
// Intl.DateTimeFormat — never by parsing a locale string (that trick silently
// breaks depending on the server's own timezone). All the math below works in
// UTC instants once converted, so it's correct regardless of where it runs.

export type Interval = { start: Date; end: Date };
export type WeeklyHoursRow = { weekday: number; start_time: string; end_time: string };
export type RangeRow = { starts_at: string; ends_at: string };
export type BookingRow = { starts_at: string; ends_at: string; buffer_minutes: number };

const pad = (n: number) => String(n).padStart(2, "0");

function getOffsetMs(date: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asIfUtc - date.getTime();
}

/** Converts a wall-clock date+time in `timeZone` to the UTC instant it represents. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, hh, mm, 0));
  const offset = getOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Reads an instant's wall-clock date, time and weekday in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
    hour, minute: Number(get("minute")), weekday: WEEKDAY_MAP[get("weekday")] ?? 0,
  };
}

/** The calendar date (YYYY-MM-DD) an instant falls on in `timeZone`. */
export function zonedDateStr(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A "HH:MM" or "h:mm am/pm"-style rendering of an instant, in `timeZone`. */
export function formatLocalTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

/** A long, weekday-aware rendering of a calendar date (not an instant). */
export function formatLocalDateLong(dateStr: string, timeZone: string): string {
  const noon = zonedTimeToUtc(dateStr, "12:00", timeZone); // noon avoids any DST-edge ambiguity
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(noon);
}

export function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every calendar date from `fromStr` to `toStr`, inclusive. */
export function listDates(fromStr: string, toStr: string): string[] {
  const out: string[] = [];
  let d = new Date(fromStr + "T00:00:00Z");
  const end = new Date(toStr + "T00:00:00Z");
  while (d.getTime() <= end.getTime()) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

/** True if any working-hours window exists for that calendar date's weekday. */
export function isWorkingDay(weeklyHours: WeeklyHoursRow[], dateStr: string): boolean {
  const weekday = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return weeklyHours.some((w) => w.weekday === weekday);
}

function alignToGrid(base: Date, from: Date, stepMs: number): Date {
  const diff = from.getTime() - base.getTime();
  if (diff <= 0) return new Date(base.getTime());
  const steps = Math.ceil(diff / stepMs);
  return new Date(base.getTime() + steps * stepMs);
}

/**
 * The pure slot-finding step: given resolved UTC windows and busy intervals,
 * returns every candidate start time, on the interval grid, where the whole
 * shoot plus its buffer fits inside a window and touches nothing busy.
 * Matches the half-open-interval semantics of the DB's exclusion constraint:
 * a candidate ending exactly when a busy interval starts does NOT conflict.
 */
export function computeSlots(opts: {
  windows: Interval[];
  durationMinutes: number;
  bufferMinutes: number;
  intervalMinutes: number;
  busy: Interval[];
  earliestStart: Date;
}): Interval[] {
  const { windows, durationMinutes, bufferMinutes, intervalMinutes, busy, earliestStart } = opts;
  const durMs = durationMinutes * 60000;
  const bufMs = bufferMinutes * 60000;
  const stepMs = intervalMinutes * 60000;
  const slots: Interval[] = [];

  for (const w of windows) {
    const from = new Date(Math.max(w.start.getTime(), earliestStart.getTime()));
    let cursor = alignToGrid(w.start, from, stepMs);
    while (cursor.getTime() + durMs <= w.end.getTime()) {
      const slotEnd = new Date(cursor.getTime() + durMs);
      const blockedEnd = new Date(cursor.getTime() + durMs + bufMs);
      const conflict = busy.some((b) => cursor.getTime() < b.end.getTime() && blockedEnd.getTime() > b.start.getTime());
      if (!conflict) slots.push({ start: new Date(cursor), end: slotEnd });
      cursor = new Date(cursor.getTime() + stepMs);
    }
  }
  return slots;
}

/** Shapes raw DB rows for one calendar date and runs computeSlots. */
export function getAvailableSlotsForDate(opts: {
  dateStr: string;
  durationMinutes: number;
  timezone: string;
  weeklyHours: WeeklyHoursRow[];
  blocks: RangeRow[];
  bookings: BookingRow[];
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeHours: number;
  now: Date;
}): Interval[] {
  const weekday = new Date(opts.dateStr + "T00:00:00Z").getUTCDay();
  const windows: Interval[] = opts.weeklyHours
    .filter((w) => w.weekday === weekday)
    .map((w) => ({
      start: zonedTimeToUtc(opts.dateStr, w.start_time.slice(0, 5), opts.timezone),
      end: zonedTimeToUtc(opts.dateStr, w.end_time.slice(0, 5), opts.timezone),
    }));
  if (windows.length === 0) return [];

  const busy: Interval[] = [
    ...opts.blocks.map((b) => ({ start: new Date(b.starts_at), end: new Date(b.ends_at) })),
    ...opts.bookings.map((b) => ({
      start: new Date(b.starts_at),
      end: new Date(new Date(b.ends_at).getTime() + b.buffer_minutes * 60000),
    })),
  ];

  const earliestStart = new Date(opts.now.getTime() + opts.minNoticeHours * 3600000);

  return computeSlots({
    windows, durationMinutes: opts.durationMinutes, bufferMinutes: opts.bufferMinutes,
    intervalMinutes: opts.slotIntervalMinutes, busy, earliestStart,
  });
}

/** Per-day slot counts across a date range, from one batch of fetched rows. */
export function summarizeRange(opts: {
  dates: string[];
  durationMinutes: number;
  timezone: string;
  weeklyHours: WeeklyHoursRow[];
  blocks: RangeRow[];
  bookings: BookingRow[];
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minNoticeHours: number;
  now: Date;
}): { date: string; closed: boolean; hasSlots: boolean; slotCount: number }[] {
  return opts.dates.map((date) => {
    const closed = !isWorkingDay(opts.weeklyHours, date);
    const slots = closed ? [] : getAvailableSlotsForDate({ ...opts, dateStr: date });
    return { date, closed, hasSlots: slots.length > 0, slotCount: slots.length };
  });
}
