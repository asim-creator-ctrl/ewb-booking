import { Client } from "pg";
import { getAvailableSlotsForDate, formatLocalTime, zonedTimeToUtc, addDaysStr } from "../lib/availability";

async function main() {
  const client = new Client({ host: "/var/run/postgresql", database: "t2", user: "postgres" });
  await client.connect();

  const settingsRes = await client.query("select * from settings where id=1");
  const settings = settingsRes.rows[0];
  console.log("timezone:", settings.timezone, "buffer:", settings.buffer_minutes, "interval:", settings.slot_interval_minutes);

  const date = "2026-10-05"; // a Monday
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();
  const weeklyHours = (await client.query("select weekday,start_time,end_time from weekly_hours where weekday=$1", [weekday])).rows;
  console.log("windows for weekday", weekday, weeklyHours);

  // 1. Baseline: no bookings, no blocks -> should offer slots in both windows
  let slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes: 60, timezone: settings.timezone, weeklyHours, blocks: [], bookings: [],
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now: new Date("2026-09-01T00:00:00Z"),
  });
  console.log(`\n[baseline] ${slots.length} slots (60min):`, slots.map((s) => formatLocalTime(s.start.toISOString(), settings.timezone)).join(", "));

  // 2. Insert a real booking (confirmed) at 4pm-5pm IST, buffer 30, via the actual DB constraint
  const starts = zonedTimeToUtc(date, "16:00", settings.timezone).toISOString();
  const ends = zonedTimeToUtc(date, "17:00", settings.timezone).toISOString();
  await client.query(
    `insert into bookings (service_name,duration_minutes,starts_at,ends_at,buffer_minutes,total_paise,advance_paise,status)
     values ('Photography',60,$1,$2,30,500000,250000,'confirmed')`,
    [starts, ends],
  );
  const bookings = (await client.query(
    `select starts_at,ends_at,buffer_minutes from bookings where status in ('held','confirmed','completed','closed')
     and starts_at < $1 and ends_at > $2`,
    [zonedTimeToUtc(addDaysStr(date, 1), "00:00", settings.timezone).toISOString(), zonedTimeToUtc(date, "00:00", settings.timezone).toISOString()],
  )).rows;

  slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes: 60, timezone: settings.timezone, weeklyHours, blocks: [], bookings,
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now: new Date("2026-09-01T00:00:00Z"),
  });
  console.log(`\n[with 4-5pm booking] ${slots.length} slots:`, slots.map((s) => formatLocalTime(s.start.toISOString(), settings.timezone)).join(", "));
  const has330 = slots.some((s) => formatLocalTime(s.start.toISOString(), settings.timezone) === "3:30 PM");
  const has400 = slots.some((s) => formatLocalTime(s.start.toISOString(), settings.timezone) === "4:00 PM");
  console.log("  3:30pm still offered (should be false, buffer collision):", has330);
  console.log("  4:00pm still offered (should be false, exact overlap):", has400);

  // 3. Try to double-book that exact slot via the DB itself -- constraint should reject it
  try {
    await client.query(
      `insert into bookings (service_name,duration_minutes,starts_at,ends_at,buffer_minutes,total_paise,advance_paise,status)
       values ('Video',60,$1,$2,30,500000,250000,'held')`,
      [starts, ends],
    );
    console.log("\n[DB constraint] FAILED -- duplicate booking was allowed!");
  } catch (e: unknown) {
    console.log("\n[DB constraint] correctly rejected double-booking:", (e as Error).message.split("\n")[0]);
  }

  // 4. Admin blocks the whole day -> should offer nothing
  const dayStart = zonedTimeToUtc(date, "00:00", settings.timezone).toISOString();
  const dayEnd = zonedTimeToUtc(addDaysStr(date, 1), "00:00", settings.timezone).toISOString();
  const blocks = [{ starts_at: dayStart, ends_at: dayEnd }];
  slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes: 60, timezone: settings.timezone, weeklyHours, blocks, bookings: [],
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now: new Date("2026-09-01T00:00:00Z"),
  });
  console.log(`\n[whole day blocked] ${slots.length} slots (expect 0)`);

  // 5. Non-working day (weekly_hours has none for e.g. if we ask a weekday with no rows -- but Asim works every day, so simulate by fetching a weekday with no hours)
  const noHours = (await client.query("select weekday,start_time,end_time from weekly_hours where weekday=99")).rows;
  slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes: 60, timezone: settings.timezone, weeklyHours: noHours, blocks: [], bookings: [],
    bufferMinutes: settings.buffer_minutes, slotIntervalMinutes: settings.slot_interval_minutes,
    minNoticeHours: settings.min_notice_hours, now: new Date("2026-09-01T00:00:00Z"),
  });
  console.log(`[no working hours that day] ${slots.length} slots (expect 0)`);

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
