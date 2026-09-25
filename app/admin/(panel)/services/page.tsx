import { requireAdmin } from "@/lib/auth";
import { formatDuration } from "@/lib/pricing";
import type { Service, ServiceDuration } from "@/lib/types";
import { Field, Flash, PageHead, Row, Section, Toggle, toRupees, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import {
  createDuration, createService, deleteDuration, deleteService, updateDuration, updateService,
} from "../actions";

export default async function ServicesPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const [{ data: services }, { data: durations }] = await Promise.all([
    supabase.from("services").select("*").order("sort").returns<Service[]>(),
    supabase.from("service_durations").select("*").order("minutes").returns<ServiceDuration[]>(),
  ]);

  return (
    <>
      <PageHead title="Shoots & pricing">
        Shoot types and what each duration costs. Changes show on the booking page immediately.
        Turning something off hides it from new customers without touching existing bookings.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="flex max-w-3xl flex-col gap-10">
        {(services ?? []).map((s) => {
          const ds = (durations ?? []).filter((d) => d.service_id === s.id);
          return (
            <Section key={s.id} title={s.name} hint={s.active ? undefined : "Off: hidden from the booking page."}>
              <Row muted={!s.active}>
                <form action={updateService} className="grid gap-3 sm:grid-cols-[1fr_90px]">
                  <input type="hidden" name="id" value={s.id} />
                  <Field label="Name"><input name="name" defaultValue={s.name} required className="input" /></Field>
                  <Field label="Order"><input name="sort" type="number" defaultValue={s.sort} className="input" /></Field>
                  <Field label="Description" className="sm:col-span-2">
                    <textarea name="description" rows={2} defaultValue={s.description ?? ""} className="input" />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <Toggle name="active" label="Offered" defaultChecked={s.active} />
                    <span className="flex-1" />
                    <ConfirmButton formAction={deleteService}>Delete</ConfirmButton>
                    <button className="btn btn-quiet">Save shoot type</button>
                  </div>
                </form>
              </Row>

              <h3 className="mb-2 mt-6 text-sm text-muted">Durations and prices</h3>
              <div className="flex flex-col gap-2">
                {ds.map((d) => (
                  <Row key={d.id} muted={!d.active}>
                    <form action={updateDuration} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="sort" value={d.sort} />
                      <Field label="Minutes" hint={formatDuration(d.minutes)}>
                        <input name="minutes" type="number" min={15} step={15} defaultValue={d.minutes} className="input" />
                      </Field>
                      <Field label="Price (₹)">
                        <input name="price_paise" type="number" min={0} step="1" defaultValue={toRupees(d.price_paise)} className="input" />
                      </Field>
                      <Toggle name="active" label="Offered" defaultChecked={d.active} />
                      <div className="flex gap-1">
                        <ConfirmButton formAction={deleteDuration}>Delete</ConfirmButton>
                        <button className="btn btn-quiet">Save</button>
                      </div>
                    </form>
                  </Row>
                ))}
                <form action={createDuration} className="grid grid-cols-2 items-end gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="service_id" value={s.id} />
                  <input type="hidden" name="sort" value={ds.length + 1} />
                  <input type="hidden" name="active" value="on" />
                  <Field label="New duration (minutes)"><input name="minutes" type="number" min={15} step={15} required className="input" /></Field>
                  <Field label="Price (₹)"><input name="price_paise" type="number" min={0} required className="input" /></Field>
                  <button className="btn btn-quiet col-span-2 sm:col-span-1">Add duration</button>
                </form>
              </div>
            </Section>
          );
        })}

        <Section title="Add a shoot type">
          <form action={createService} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_90px]">
            <Field label="Name"><input name="name" required className="input" placeholder="e.g. Couple shoot" /></Field>
            <Field label="Order"><input name="sort" type="number" defaultValue={(services?.length ?? 0) + 1} className="input" /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={2} className="input" /></Field>
            <input type="hidden" name="active" value="on" />
            <div className="sm:col-span-2"><button className="btn btn-primary">Add shoot type</button></div>
          </form>
        </Section>
      </div>
    </>
  );
}
