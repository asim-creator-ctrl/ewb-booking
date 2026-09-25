import { describe, expect, it } from "vitest";
import {
  addDaysStr, computeSlots, formatLocalDateLong, formatLocalTime, getAvailableSlotsForDate,
  isWorkingDay, listDates, summarizeRange, zonedDateStr, zonedTimeToUtc,
} from "./availability";

describe("zonedTimeToUtc / zonedDateStr — timezone math", () => {
  it("converts Kolkata wall-clock time to the correct UTC instant (+5:30, no DST)", () => {
    expect(zonedTimeToUtc("2026-10-12", "16:00", "Asia/Kolkata").toISOString()).toBe("2026-10-12T10:30:00.000Z");
  });

  it("rolls over to the previous UTC day for early Kolkata mornings", () => {
    expect(zonedTimeToUtc("2026-01-01", "00:00", "Asia/Kolkata").toISOString()).toBe("2025-12-31T18:30:00.000Z");
  });

  it("is a no-op for UTC itself", () => {
    expect(zonedTimeToUtc("2026-06-15", "12:00", "UTC").toISOString()).toBe("2026-06-15T12:00:00.000Z");
  });

  it("round-trips through zonedDateStr", () => {
    const instant = zonedTimeToUtc("2026-10-12", "23:45", "Asia/Kolkata");
    expect(zonedDateStr(instant, "Asia/Kolkata")).toBe("2026-10-12");
  });

  it("does not depend on the machine's own timezone (uses Intl offset math, not locale-string parsing)", () => {
    // A regression guard: the common `new Date(x.toLocaleString('en-US',{timeZone}))` trick
    // silently picks up the *server's* local timezone. This asserts a fixed, known answer.
    const a = zonedTimeToUtc("2026-03-01", "09:00", "Asia/Kolkata");
    const b = zonedTimeToUtc("2026-03-01", "09:00", "Asia/Kolkata");
    expect(a.getTime()).toBe(b.getTime());
    expect(a.toISOString()).toBe("2026-03-01T03:30:00.000Z");
  });
});

describe("addDaysStr / listDates", () => {
  it("adds calendar days across a month boundary", () => {
    expect(addDaysStr("2026-09-30", 1)).toBe("2026-10-01");
  });
  it("lists an inclusive date range", () => {
    expect(listDates("2026-09-28", "2026-10-01")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
  });
});

describe("isWorkingDay", () => {
  const mondayOnly = [{ weekday: 1, start_time: "10:00", end_time: "14:00" }];
  it("true on a matching weekday (2026-09-28 is a Monday)", () => {
    expect(isWorkingDay(mondayOnly, "2026-09-28")).toBe(true);
  });
  it("false on a non-matching weekday (2026-09-27 is a Sunday)", () => {
    expect(isWorkingDay(mondayOnly, "2026-09-27")).toBe(false);
  });
});

const iv = (h1: number, m1: number, h2: number, m2: number) => ({
  start: new Date(Date.UTC(2026, 0, 1, h1, m1)),
  end: new Date(Date.UTC(2026, 0, 1, h2, m2)),
});

describe("computeSlots — pure grid logic", () => {
  it("fills a window end-to-end on the interval grid", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 14, 0)], durationMinutes: 60, bufferMinutes: 0, intervalMinutes: 30,
      busy: [], earliestStart: new Date(0),
    });
    expect(slots.map((s) => s.start.getUTCHours() + ":" + s.start.getUTCMinutes())).toEqual([
      "10:0", "10:30", "11:0", "11:30", "12:0", "12:30", "13:0",
    ]);
  });

  it("excludes a slot that overlaps a busy interval", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 14, 0)], durationMinutes: 60, bufferMinutes: 0, intervalMinutes: 30,
      busy: [iv(11, 0, 12, 0)], earliestStart: new Date(0),
    });
    expect(slots.some((s) => s.start.getUTCHours() === 10 && s.start.getUTCMinutes() === 30)).toBe(false); // 10:30-11:30 overlaps
    expect(slots.some((s) => s.start.getUTCHours() === 12 && s.start.getUTCMinutes() === 0)).toBe(true); // 12:00-13:00 is free
  });

  it("respects the buffer after a candidate, blocking a slot that would land inside it", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 14, 0)], durationMinutes: 60, bufferMinutes: 30, intervalMinutes: 30,
      busy: [iv(12, 0, 12, 30)], earliestStart: new Date(0),
    });
    // 11:00-12:00 + 30min buffer -> blocked till 12:30, which overlaps the busy 12:00-12:30 -> excluded
    expect(slots.some((s) => s.start.getUTCHours() === 11 && s.start.getUTCMinutes() === 0)).toBe(false);
  });

  it("allows a slot that ends exactly when a busy interval starts (touching, not overlapping)", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 14, 0)], durationMinutes: 60, bufferMinutes: 30, intervalMinutes: 30,
      busy: [iv(11, 30, 12, 0)], earliestStart: new Date(0),
    });
    // 10:00-11:00 + 30min buffer ends exactly at 11:30 = busy start -> allowed (matches DB's '[)' exclusion constraint)
    expect(slots.some((s) => s.start.getUTCHours() === 10 && s.start.getUTCMinutes() === 0)).toBe(true);
  });

  it("excludes slots before the earliest allowed start (minimum notice)", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 14, 0)], durationMinutes: 60, bufferMinutes: 0, intervalMinutes: 30,
      busy: [], earliestStart: new Date(Date.UTC(2026, 0, 1, 11, 15)),
    });
    expect(slots[0].start.getUTCHours()).toBe(11);
    expect(slots[0].start.getUTCMinutes()).toBe(30); // rounds up to the next grid step, not down
  });

  it("offers nothing when the duration doesn't fit any window", () => {
    const slots = computeSlots({
      windows: [iv(10, 0, 10, 45)], durationMinutes: 60, bufferMinutes: 0, intervalMinutes: 30,
      busy: [], earliestStart: new Date(0),
    });
    expect(slots).toEqual([]);
  });
});

describe("getAvailableSlotsForDate — end to end with real timezone conversion", () => {
  const weeklyHours = [
    { weekday: 1, start_time: "10:00:00", end_time: "14:00:00" }, // Monday
    { weekday: 1, start_time: "15:00:00", end_time: "19:00:00" },
  ];
  const base = {
    dateStr: "2026-09-28", // a Monday
    durationMinutes: 60, timezone: "Asia/Kolkata", weeklyHours,
    bufferMinutes: 30, slotIntervalMinutes: 30, minNoticeHours: 0,
    now: new Date("2026-09-01T00:00:00Z"),
  };

  it("returns slots across both working windows, minus the lunch break", () => {
    const slots = getAvailableSlotsForDate({ ...base, blocks: [], bookings: [] });
    // 10-14 (60min slots, 30min grid) -> 7 slots; 15-19 -> 7 slots; none span the 14-15 break
    expect(slots.length).toBe(14); // 7 slots in 10:00-14:00 (last starts 13:00, ends exactly 14:00) + 7 in 15:00-19:00
    expect(slots.every((s) => {
      const h = new Date(s.start.getTime() + 5.5 * 3600000).getUTCHours(); // quick IST hour check
      return h < 14 || h >= 15; // nothing starts inside the 14:00-15:00 break
    })).toBe(true);
  });

  it("returns nothing on a non-working weekday", () => {
    const slots = getAvailableSlotsForDate({ ...base, dateStr: "2026-09-27", blocks: [], bookings: [] }); // Sunday
    expect(slots).toEqual([]);
  });

  it("removes slots that collide with an existing booking, respecting its own buffer", () => {
    const bookings = [{ starts_at: "2026-09-28T05:00:00Z", ends_at: "2026-09-28T06:00:00Z", buffer_minutes: 30 }]; // 10:30-11:30 IST + 30min buffer
    const slots = getAvailableSlotsForDate({ ...base, blocks: [], bookings });
    const startsAt10 = slots.some((s) => s.start.toISOString() === "2026-09-28T04:30:00.000Z");
    expect(startsAt10).toBe(false); // 10:00-11:00 IST would end right as the booking starts, but buffer pushes it into conflict
  });

  it("removes slots inside an admin block", () => {
    const blocks = [{ starts_at: zonedTimeToUtc("2026-09-28", "10:00", "Asia/Kolkata").toISOString(), ends_at: zonedTimeToUtc("2026-09-28", "12:00", "Asia/Kolkata").toISOString() }];
    const slots = getAvailableSlotsForDate({ ...base, blocks, bookings: [] });
    expect(slots.every((s) => s.start.getTime() >= zonedTimeToUtc("2026-09-28", "12:00", "Asia/Kolkata").getTime())).toBe(true);
  });

  it("applies minimum-notice hours relative to `now`", () => {
    const slots = getAvailableSlotsForDate({
      ...base, blocks: [], bookings: [], minNoticeHours: 24,
      now: zonedTimeToUtc("2026-09-27", "12:00", "Asia/Kolkata"), // 24h before 2026-09-28 12:00 IST
    });
    expect(slots.every((s) => s.start.getTime() >= zonedTimeToUtc("2026-09-28", "12:00", "Asia/Kolkata").getTime())).toBe(true);
  });
});

describe("summarizeRange", () => {
  it("marks closed days and counts free slots on open ones", () => {
    const weeklyHours = [{ weekday: 1, start_time: "10:00:00", end_time: "12:00:00" }]; // Monday only, 2h window
    const dates = listDates("2026-09-27", "2026-09-29"); // Sun, Mon, Tue
    const summary = summarizeRange({
      dates, durationMinutes: 60, timezone: "Asia/Kolkata", weeklyHours, blocks: [], bookings: [],
      bufferMinutes: 0, slotIntervalMinutes: 30, minNoticeHours: 0, now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(summary).toEqual([
      { date: "2026-09-27", closed: true, hasSlots: false, slotCount: 0 },
      { date: "2026-09-28", closed: false, hasSlots: true, slotCount: 3 }, // 10:00, 10:30, 11:00 all fit a 2h window (11:00-12:00 lands exactly on the edge)
      { date: "2026-09-29", closed: true, hasSlots: false, slotCount: 0 },
    ]);
  });
});

describe("display formatting", () => {
  it("formats a time in the business timezone", () => {
    expect(formatLocalTime("2026-09-28T04:30:00.000Z", "Asia/Kolkata")).toBe("10:00 AM");
  });
  it("formats a long date without shifting across midnight", () => {
    expect(formatLocalDateLong("2026-09-28", "Asia/Kolkata")).toBe("Monday, September 28, 2026");
  });
});
