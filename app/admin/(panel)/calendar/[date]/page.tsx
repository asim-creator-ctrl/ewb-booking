import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  addDaysStr, formatLocalDateLong, formatLocalTime, getAvailableSlotsForDate, zonedTimeToUtc,
} from "@/lib/availability";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, Flash, PageHead, Row, Section } from "@/components/ui";
import { addBlock, blockWholeDay, deleteBlock } from "../../actions";

type Block = { id: string; starts_at: string; ends_at: string; reason: string | null };
type Booking = {
  id: string; ref: string | null; service_name: string; starts_at: string; ends_at: string;
  status: string; customer_id: string | null;
};

const PREVIEW_DURATIONS = [60, 90, 120, 180];

export default async function DayPage({
  params, searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ ok?: string; error?: string; duration?: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const { ok, error, duration: durationParam } = await searchParams;
  const previewDuration = PREVIEW_DURATIONS.includes(Number(durationParam)) ? Number(durationParam) : 60;

  const { supabase } = await requireAdmin();
  const { data: settings } = await supabase.from("settings").select("*").eq("id", 1).single();
  const tz = settings!.timezone;
  const weekday = new Date(date + "T00:00:00Z").getUTCDay();

  const dayStart = zonedTimeToUtc(date, "00:00", tz).toISOString();
  const dayEnd = zonedTimeToUtc(addDaysStr(date, 1), "00:00", tz).toISOString();

  const [{ data: weeklyHours }, { data: blocks }, { data: bookings }] = await Promise.all([
    supabase.from("weekly_hours").select("weekday,start_time,end_time").eq("weekday", weekday).order("start_time"),
    supabase.from("blocks").select("id,starts_at,ends_at,reason").lt("starts_at", dayEnd).gt("ends_at", dayStart).order("starts_at").returns<Block[]>(),
    supabase.from("bookings").select("id,ref,service_name,starts_at,ends_at,status,customer_id")
      .in("status", ["held", "confirmed", "completed", "closed"])
      .lt("starts_at", dayEnd).gt("ends_at", dayStart).order("starts_at").returns<Booking[]>(),
  ]);

  const slots = getAvailableSlotsForDate({
    dateStr: date, durationMinutes: previewDuration, timezone: tz,
    weeklyHours: weeklyHours ?? [], blocks: blocks ?? [],
    bookings: (bookings ?? []).map((b) => ({ starts_at: b.starts_at, ends_at: b.ends_at, buffer_minutes: settings!.buffer_minutes })),
    bufferMinutes: settings!.buffer_minutes, slotIntervalMinutes: settings!.slot_interval_minutes,
    minNoticeHours: settings!.min_notice_hours, now: new Date(),
  });

  const isWorking = (weeklyHours ?? []).length > 0;

  return (
    <>
      <div className="mb-2 flex max-w-2xl items-center justify-between text-sm">
        <Link href={`/admin/calendar/${addDaysStr(date, -1)}`} className="text-muted hover:text-paper">&larr; {addDaysStr(date, -1)}</Link>
        <Link href="/admin/calendar" className="text-muted hover:text-paper underline underline-offset-4">Back to month</Link>
        <Link href={`/admin/calendar/${addDaysStr(date, 1)}`} className="text-muted hover:text-paper">{addDaysStr(date, 1)} &rarr;</Link>
      </div>
      <PageHead title={formatLocalDateLong(date, tz)} />
      <Flash ok={ok} error={error} />

      <div className="max-w-2xl">
        <Section title="Working hours"
          hint={isWorking ? undefined : "Not a working day this week — edit this in Working hours if that's wrong."}>
          {isWorking ? (
            <div className="flex flex-wrap gap-2">
              {(weeklyHours ?? []).map((w, i) => (
                <span key={i} className="rounded-full border border-line px-3 py-1 text-sm">
                  {w.start_time.slice(0, 5)} – {w.end_time.slice(0, 5)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No shoots are scheduled on this weekday.</p>
          )}
        </Section>

        <Section title="Blocked time" hint="Time you've set aside — days off, personal commitments, anything you're not shooting.">
          <div className="flex flex-col gap-2">
            {(blocks ?? []).length === 0 && <p className="text-sm text-muted">Nothing blocked today.</p>}
            {(blocks ?? []).map((b) => (
              <Row key={b.id}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">{formatLocalTime(b.starts_at, tz)} – {formatLocalTime(b.ends_at, tz)}</div>
                    {b.reason && <div className="text-xs text-muted">{b.reason}</div>}
                  </div>
                  <form>
                    <input type="hidden" name="id" value={b.id} />
                    <input type="hidden" name="date" value={date} />
                    <ConfirmButton formAction={deleteBlock} message="Remove this block?">Remove</ConfirmButton>
                  </form>
                </div>
              </Row>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <form action={blockWholeDay}>
              <input type="hidden" name="date" value={date} />
              <button className="btn btn-quiet">Block the whole day</button>
            </form>
          </div>

          <form action={addBlock} className="mt-4 grid grid-cols-2 items-end gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="hidden" name="date" value={date} />
            <Field label="From"><input type="time" name="start_time" required defaultValue="14:00" className="input" /></Field>
            <Field label="Until"><input type="time" name="end_time" required defaultValue="15:00" className="input" /></Field>
            <Field label="Reason (optional)" className="col-span-2 sm:col-span-1">
              <input name="reason" className="input" placeholder="e.g. Dentist" />
            </Field>
            <button className="btn btn-primary col-span-2 sm:col-span-1">Block this time</button>
          </form>
        </Section>

        <Section title="Bookings">
          {(bookings ?? []).length === 0 ? (
            <p className="text-sm text-muted">No bookings yet — that arrives with payments in a later phase.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(bookings ?? []).map((b) => (
                <Row key={b.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium">{b.service_name}</div>
                      <div className="text-xs text-muted">{formatLocalTime(b.starts_at, tz)} – {formatLocalTime(b.ends_at, tz)} · {b.status}</div>
                    </div>
                    {b.ref && <span className="text-xs text-muted">{b.ref}</span>}
                  </div>
                </Row>
              ))}
            </div>
          )}
        </Section>

        <Section title="Free slots preview"
          hint="Exactly what the booking page would offer for this date, computed live from your working hours, blocks and bookings.">
          <div className="mb-3 flex flex-wrap gap-2">
            {PREVIEW_DURATIONS.map((d) => (
              <Link key={d} href={`/admin/calendar/${date}?duration=${d}`}
                className={`rounded-full border px-3 py-1 text-sm ${d === previewDuration ? "border-safelight text-safelight" : "border-line text-muted"}`}>
                {d} min
              </Link>
            ))}
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-muted">No {previewDuration}-minute slot fits today.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((s, i) => (
                <span key={i} className="rounded-full border border-line px-3 py-1 text-sm">{formatLocalTime(s.start.toISOString(), tz)}</span>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
