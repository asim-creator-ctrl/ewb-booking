import { requireAdmin } from "@/lib/auth";
import { Field, Flash, PageHead, Section, type Search } from "@/components/ui";
import { savePolicy } from "../actions";

type Policy = { id: string; type: string; version: number; title: string; body: string; active: boolean; created_at: string };

const TYPES = [
  { type: "cancellation", title: "Cancellation policy", hint: "Notice period, how much of the advance is refunded, no-shows, late arrival." },
  { type: "rescheduling", title: "Rescheduling policy", hint: "How many reschedules, how much notice, bad weather for outdoor shoots." },
  { type: "terms", title: "Terms of booking", hint: "Customers accept these before paying." },
  { type: "refund", title: "Refund policy", hint: "Razorpay requires a refund policy page before activating payments." },
  { type: "privacy", title: "Privacy policy", hint: "Also required by Razorpay." },
] as const;

export default async function PoliciesPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("policies").select("*").order("version", { ascending: false }).returns<Policy[]>();
  const policies = data ?? [];

  return (
    <>
      <PageHead title="Policies">
        Each save creates a new version. Bookings keep the exact version the customer agreed to, so editing
        a policy never changes the terms of an existing booking.
      </PageHead>
      <Flash {...await searchParams} />

      <div className="max-w-3xl">
        {TYPES.map((t) => {
          const current = policies.find((p) => p.type === t.type && p.active);
          const count = policies.filter((p) => p.type === t.type).length;
          return (
            <Section key={t.type} title={t.title}
              hint={<>{t.hint} {current ? `Live: version ${current.version} of ${count}.` : "Not written yet."}</>}>
              <form action={savePolicy} className="flex flex-col gap-3">
                <input type="hidden" name="type" value={t.type} />
                <Field label="Title"><input name="title" defaultValue={current?.title ?? t.title} required className="input" /></Field>
                <Field label="Text"><textarea name="body" rows={8} defaultValue={current?.body ?? ""} required className="input" /></Field>
                <div><button className="btn btn-quiet">Save as new version</button></div>
              </form>
            </Section>
          );
        })}
      </div>
    </>
  );
}
