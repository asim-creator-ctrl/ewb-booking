import { requireAdmin } from "@/lib/auth";
import { Field, Flash, PageHead, Section, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { addHours, deleteHours } from "../actions";

type Window = { id: string; weekday: number; start_time: string; end_time: string };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // week starts Monday

const fmt = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${ampm}`;
};

export default async function HoursPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("weekly_hours").select("*").order("start_time").returns<Window[]>();
  const windows = data ?? [];

  return (
    <>
      <PageHead title="Working hours">
        Your regular week. A break is simply the gap between two windows. Blocking specific dates and times
        comes with the calendar in the next phase.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="max-w-3xl">
        <Section title="Your week">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {ORDER.map((d) => {
              const ws = windows.filter((w) => w.weekday === d);
              return (
                <li key={d} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <span className="w-28 font-medium">{DAYS[d]}</span>
                  {ws.length === 0 && <span className="text-sm text-muted">Not taking shoots</span>}
                  {ws.map((w, i) => (
                    <span key={w.id} className="flex items-center gap-1">
                      {i > 0 && <span className="mr-2 text-xs text-muted">break</span>}
                      <form className="inline-flex items-center gap-1 rounded-full border border-line py-0.5 pl-3 pr-1 text-sm">
                        <input type="hidden" name="id" value={w.id} />
                        {fmt(w.start_time)} – {fmt(w.end_time)}
                        <ConfirmButton formAction={deleteHours} message={`Remove ${DAYS[d]} ${fmt(w.start_time)}–${fmt(w.end_time)}?`}>
                          <span aria-label="Remove">×</span>
                        </ConfirmButton>
                      </form>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Add a working window" hint="Pick several days to add the same window to each. Windows on the same day can't overlap.">
          <form action={addHours} className="flex flex-col gap-4 rounded-xl border border-dashed border-line p-4">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="mb-2 text-sm text-muted">Days</legend>
              {ORDER.map((d) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="weekday" value={d} className="peer sr-only" />
                  <span className="inline-flex min-h-10 items-center rounded-full border border-line px-3 text-sm text-muted peer-checked:border-safelight peer-checked:text-paper peer-focus-visible:outline-2 peer-focus-visible:outline-safelight">
                    {DAYS[d].slice(0, 3)}
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <Field label="From"><input type="time" name="start_time" required defaultValue="10:00" className="input" /></Field>
              <Field label="Until"><input type="time" name="end_time" required defaultValue="14:00" className="input" /></Field>
            </div>
            <div><button className="btn btn-primary">Add window</button></div>
          </form>
        </Section>
      </div>
    </>
  );
}
