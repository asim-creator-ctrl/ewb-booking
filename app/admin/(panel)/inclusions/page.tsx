import { requireAdmin } from "@/lib/auth";
import type { Inclusion } from "@/lib/types";
import { Field, Flash, PageHead, Row, Section, Toggle, toRupees, type Search } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import {
  createChargeItem, createInclusion, deleteChargeItem, deleteInclusion, updateChargeItem, updateInclusion,
} from "../actions";

type ChargeItem = { id: string; name: string; description: string | null; default_amount_paise: number | null; active: boolean; sort: number };

function InclusionList({ items, included }: { items: Inclusion[]; included: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <Row key={i.id} muted={!i.active}>
          <form action={updateInclusion} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={i.id} />
            {included && <input type="hidden" name="is_included" value="on" />}
            <input name="sort" type="number" defaultValue={i.sort} aria-label="Order" className="input w-16!" />
            <input name="text" defaultValue={i.text} required aria-label="Text" className="input min-w-0 flex-1 basis-60" />
            <Toggle name="active" label="Shown" defaultChecked={i.active} />
            <ConfirmButton formAction={deleteInclusion}>Delete</ConfirmButton>
            <button className="btn btn-quiet">Save</button>
          </form>
        </Row>
      ))}
      <form action={createInclusion} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line p-4">
        {included && <input type="hidden" name="is_included" value="on" />}
        <input type="hidden" name="active" value="on" />
        <input type="hidden" name="sort" value={items.length + 1} />
        <input name="text" required placeholder={included ? "e.g. 30 edited photos" : "e.g. Outfit changes"} aria-label="New line" className="input min-w-0 flex-1 basis-60" />
        <button className="btn btn-quiet">Add line</button>
      </form>
    </div>
  );
}

export default async function InclusionsPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const [{ data: inclusions }, { data: charges }] = await Promise.all([
    supabase.from("inclusions").select("*").order("sort").returns<Inclusion[]>(),
    supabase.from("charge_items").select("*").order("sort").returns<ChargeItem[]>(),
  ]);
  const all = inclusions ?? [];

  return (
    <>
      <PageHead title="Included & extras">
        What the shoot fee covers, what it doesn&rsquo;t, and the extra charges you can add to a booking later.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="max-w-3xl">
        <Section title="Included in the shoot fee"
          hint="Numbers answer DMs. “30 edited photos in 7 days” beats “final edited images”.">
          <InclusionList items={all.filter((i) => i.is_included)} included />
        </Section>

        <Section title="Not included"
          hint="Shown to the customer before they pay, so nobody assumes makeup or studio rent is covered.">
          <InclusionList items={all.filter((i) => !i.is_included)} included={false} />
        </Section>

        <Section title="Extra charge types"
          hint="Studio rental, travel, props and so on. You'll pick from these when adding a charge to a booking. The amount is a starting value; you set the real one each time.">
          <div className="flex flex-col gap-2">
            {(charges ?? []).map((c) => (
              <Row key={c.id} muted={!c.active}>
                <form action={updateChargeItem} className="grid items-end gap-3 sm:grid-cols-[1fr_140px_auto]">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="sort" value={c.sort} />
                  <input type="hidden" name="description" value={c.description ?? ""} />
                  <Field label="Name"><input name="name" defaultValue={c.name} required className="input" /></Field>
                  <Field label="Usual amount (₹)"><input name="default_amount_paise" type="number" min={0} defaultValue={toRupees(c.default_amount_paise)} className="input" /></Field>
                  <div className="flex items-center gap-1">
                    <Toggle name="active" label="On" defaultChecked={c.active} />
                    <ConfirmButton formAction={deleteChargeItem}>Delete</ConfirmButton>
                    <button className="btn btn-quiet">Save</button>
                  </div>
                </form>
              </Row>
            ))}
            <form action={createChargeItem} className="grid items-end gap-3 rounded-xl border border-dashed border-line p-4 sm:grid-cols-[1fr_140px_auto]">
              <input type="hidden" name="active" value="on" />
              <input type="hidden" name="sort" value={(charges?.length ?? 0) + 1} />
              <Field label="Name"><input name="name" required className="input" /></Field>
              <Field label="Usual amount (₹)"><input name="default_amount_paise" type="number" min={0} className="input" /></Field>
              <button className="btn btn-quiet">Add charge type</button>
            </form>
          </div>
        </Section>
      </div>
    </>
  );
}
