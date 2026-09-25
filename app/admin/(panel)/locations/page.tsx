import { requireAdmin } from "@/lib/auth";
import type { LocationOption, LocationZone } from "@/lib/types";
import { Field, Flash, PageHead, Row, Section, Toggle, toRupees, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import {
  createLocation, createZone, deleteLocation, deleteZone, updateLocation, updateZone,
} from "../actions";

function LocationFields({ l }: { l?: LocationOption }) {
  return (
    <>
      <Field label="Indoor or outdoor">
        <select name="setting" defaultValue={l?.setting ?? "outdoor"} className="input">
          <option value="outdoor">Outdoor</option>
          <option value="indoor">Indoor</option>
        </select>
      </Field>
      <Field label="Shown to customer as"><input name="label" defaultValue={l?.label} required className="input" /></Field>
      <Field label="Charge">
        <select name="charge_type" defaultValue={l?.charge_type ?? "included"} className="input">
          <option value="included">Included (₹0)</option>
          <option value="fixed">Fixed charge</option>
          <option value="quote">Not included — cost confirmed later</option>
        </select>
      </Field>
      <Field label="Fixed charge (₹)" hint="Only used when charge is “Fixed”.">
        <input name="amount_paise" type="number" min={0} defaultValue={toRupees(l?.amount_paise ?? 0)} className="input" />
      </Field>
      <Field label="Note shown to customer" className="sm:col-span-2"
        hint="Say plainly what isn't covered, e.g. “Studio rental is not included in the shoot fee.”">
        <input name="note" defaultValue={l?.note ?? ""} className="input" />
      </Field>
    </>
  );
}

function ZoneFields({ z }: { z?: LocationZone }) {
  return (
    <>
      <Field label="Area name"><input name="name" defaultValue={z?.name} required className="input" /></Field>
      <Field label="Travel charge (₹)"><input name="charge_paise" type="number" min={0} defaultValue={toRupees(z?.charge_paise ?? 0)} className="input" /></Field>
      <Field label="Neighbourhoods (helps customers pick)" className="sm:col-span-2">
        <input name="description" defaultValue={z?.description ?? ""} className="input" placeholder="e.g. Gariahat, Ballygunge, Tollygunge" />
      </Field>
    </>
  );
}

export default async function LocationsPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const [{ data: locations }, { data: zones }] = await Promise.all([
    supabase.from("location_options").select("*").order("sort").returns<LocationOption[]>(),
    supabase.from("location_zones").select("*").order("sort").returns<LocationZone[]>(),
  ]);

  return (
    <>
      <PageHead title="Locations & areas">
        Where the shoot happens and what that adds to the price.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="max-w-3xl">
        <Section title="Location options"
          hint="What the customer chooses after indoor/outdoor. “Add area charge” means they also pick an area below and its travel charge is added.">
          <div className="flex flex-col gap-2">
            {(locations ?? []).map((l) => (
              <Row key={l.id} muted={!l.active}>
                <form action={updateLocation} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="sort" value={l.sort} />
                  <LocationFields l={l} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                    <Toggle name="uses_zone" label="Add area charge" defaultChecked={l.uses_zone} />
                    <Toggle name="active" label="Offered" defaultChecked={l.active} />
                    <span className="flex-1" />
                    <ConfirmButton formAction={deleteLocation}>Delete</ConfirmButton>
                    <button className="btn btn-quiet">Save</button>
                  </div>
                </form>
              </Row>
            ))}
            <form action={createLocation} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
              <input type="hidden" name="sort" value={(locations?.length ?? 0) + 1} />
              <input type="hidden" name="active" value="on" />
              <LocationFields />
              <div className="flex items-center gap-4 sm:col-span-2">
                <Toggle name="uses_zone" label="Add area charge" defaultChecked />
                <button className="btn btn-primary">Add location option</button>
              </div>
            </form>
          </div>
        </Section>

        <Section title="Areas"
          hint="Travel pricing by area. Mark an area “needs a quote” (e.g. outside Kolkata) and customers are asked to message you instead of paying online.">
          <div className="flex flex-col gap-2">
            {(zones ?? []).map((z) => (
              <Row key={z.id} muted={!z.active}>
                <form action={updateZone} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={z.id} />
                  <input type="hidden" name="sort" value={z.sort} />
                  <ZoneFields z={z} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                    <Toggle name="requires_quote" label="Needs a quote" defaultChecked={z.requires_quote} />
                    <Toggle name="active" label="Offered" defaultChecked={z.active} />
                    <span className="flex-1" />
                    <ConfirmButton formAction={deleteZone}>Delete</ConfirmButton>
                    <button className="btn btn-quiet">Save</button>
                  </div>
                </form>
              </Row>
            ))}
            <form action={createZone} className="grid gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
              <input type="hidden" name="sort" value={(zones?.length ?? 0) + 1} />
              <input type="hidden" name="active" value="on" />
              <ZoneFields />
              <div className="flex items-center gap-4 sm:col-span-2">
                <Toggle name="requires_quote" label="Needs a quote" />
                <button className="btn btn-primary">Add area</button>
              </div>
            </form>
          </div>
        </Section>
      </div>
    </>
  );
}
