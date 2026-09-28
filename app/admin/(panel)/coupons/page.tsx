import { requireAdmin } from "@/lib/auth";
import { addDaysStr, zonedDateStr } from "@/lib/availability";
import type { Coupon, Service } from "@/lib/types";
import { Field, Flash, PageHead, Row, Section, Toggle, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { createCoupon, updateCoupon, deleteCoupon } from "./actions";

export default async function CouponsPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const [{ data: coupons }, { data: services }, { data: settingsRow }] = await Promise.all([
    supabase.from("coupons").select("*").order("created_at", { ascending: false }).returns<Coupon[]>(),
    supabase.from("services").select("id,name").order("sort").returns<Pick<Service, "id" | "name">[]>(),
    supabase.from("settings").select("timezone").eq("id", 1).single(),
  ]);
  const tz = settingsRow?.timezone ?? "Asia/Kolkata";

  return (
    <>
      <PageHead title="Coupons">
        Percentage discounts for specific shoot types, valid only within a date range. Customers apply a code on the
        booking page&rsquo;s Review step.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="flex max-w-3xl flex-col gap-6">
        {(coupons ?? []).map((c) => {
          const fromDate = zonedDateStr(new Date(c.valid_from), tz);
          const untilDate = addDaysStr(zonedDateStr(new Date(c.valid_until), tz), -1);
          const expired = new Date(c.valid_until).getTime() < Date.now();
          return (
            <Row key={c.id} muted={!c.active || expired}>
              <form action={updateCoupon} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Code"><input name="code" defaultValue={c.code} required className="input uppercase" /></Field>
                <Field label="Discount %">
                  <input name="discount_percent" type="number" min={0.01} max={100} step="0.01" defaultValue={c.discount_percent} className="input" />
                </Field>
                <Field label="Valid from"><input name="valid_from_date" type="date" defaultValue={fromDate} required className="input" /></Field>
                <Field label="Valid until"><input name="valid_until_date" type="date" defaultValue={untilDate} required className="input" /></Field>
                <div className="sm:col-span-2">
                  <span className="text-sm text-muted">Applies to</span>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(services ?? []).map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm">
                        <input type="checkbox" name="service_ids" value={s.id} defaultChecked={c.service_ids.includes(s.id)} className="accent-safelight" />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <Toggle name="active" label="Active" defaultChecked={c.active} />
                  <span className="text-xs text-muted">
                    {expired ? "Expired" : `Used ${c.times_used} time${c.times_used === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex-1" />
                  <ConfirmButton formAction={deleteCoupon}>Delete</ConfirmButton>
                  <button className="btn btn-quiet">Save</button>
                </div>
              </form>
            </Row>
          );
        })}
        {(coupons ?? []).length === 0 && <p className="text-sm text-muted">No coupons yet.</p>}

        <Section title="Add a coupon">
          <form action={createCoupon} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
            <Field label="Code"><input name="code" required placeholder="e.g. DIWALI20" className="input uppercase" /></Field>
            <Field label="Discount %"><input name="discount_percent" type="number" min={0.01} max={100} step="0.01" required className="input" /></Field>
            <Field label="Valid from"><input name="valid_from_date" type="date" required className="input" /></Field>
            <Field label="Valid until"><input name="valid_until_date" type="date" required className="input" /></Field>
            <div className="sm:col-span-2">
              <span className="text-sm text-muted">Applies to</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(services ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm">
                    <input type="checkbox" name="service_ids" value={s.id} className="accent-safelight" />
                    {s.name}
                  </label>
                ))}
                {(services ?? []).length === 0 && <span className="text-sm text-muted">Add a shoot type first.</span>}
              </div>
            </div>
            <input type="hidden" name="active" value="on" />
            <div className="sm:col-span-2"><button className="btn btn-primary">Add coupon</button></div>
          </form>
        </Section>
      </div>
    </>
  );
}
