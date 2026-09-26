import { requireAdmin } from "@/lib/auth";
import type { Settings } from "@/lib/types";
import { Field, Flash, PageHead, Section, Toggle, type Search } from "@/components/ui";
import { saveSettings } from "../actions";
import { HeroImageUploader } from "./HeroImageUploader";

export default async function SettingsPage({ searchParams }: { searchParams: Search }) {
  const { supabase } = await requireAdmin();
  const { data: s } = await supabase.from("settings").select("*").eq("id", 1).single<Settings>();
  if (!s) return <p>Settings row missing. Run the seed file.</p>;

  return (
    <>
      <PageHead title="Settings">Brand details and the rules every booking follows.</PageHead>
      <Flash {...await searchParams} />

      <Section title="Homepage photo" hint="Shown at the top of your booking site, in this exact frame shape. JPG, PNG or WEBP, up to 5MB — updates the moment you save, no redeploy needed.">
        <HeroImageUploader currentUrl={s.hero_image_url} currentPositionY={s.hero_image_position_y} />
      </Section>

      <form action={saveSettings} className="max-w-3xl">
        <Section title="Booking">
          <div className="mb-4">
            <Toggle name="booking_enabled" label="Accept new bookings" defaultChecked={s.booking_enabled} />
            <p className="mt-1 text-xs text-muted">Turn off while travelling. The page stays up; the booking button pauses.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Advance (%)" hint="Paid online to confirm the booking.">
              <input name="advance_percent" type="number" min={1} max={100} step="0.01" defaultValue={Number(s.advance_percent)} className="input" />
            </Field>
            <Field label="Gap after each shoot (min)" hint="Travel and reset time. Blocks the next slot.">
              <input name="buffer_minutes" type="number" min={0} max={480} step={5} defaultValue={s.buffer_minutes} className="input" />
            </Field>
            <Field label="Slot hold during payment (min)" hint="How long a slot stays reserved at checkout.">
              <input name="hold_minutes" type="number" min={5} max={60} defaultValue={s.hold_minutes} className="input" />
            </Field>
            <Field label="Minimum notice (hours)" hint="Earliest a customer can book ahead.">
              <input name="min_notice_hours" type="number" min={0} max={720} defaultValue={s.min_notice_hours} className="input" />
            </Field>
            <Field label="Bookable up to (days ahead)">
              <input name="max_days_ahead" type="number" min={1} max={365} defaultValue={s.max_days_ahead} className="input" />
            </Field>
            <Field label="Start times every">
              <select name="slot_interval_minutes" defaultValue={s.slot_interval_minutes} className="input">
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Brand & contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Brand name"><input name="brand_name" defaultValue={s.brand_name} required className="input" /></Field>
            <Field label="Tagline"><input name="tagline" defaultValue={s.tagline} required className="input" /></Field>
            <Field label="Instagram username"><input name="instagram_username" defaultValue={s.instagram_username} required className="input" /></Field>
            <Field label="WhatsApp number" hint="With country code, e.g. +919876543210">
              <input name="whatsapp_number" defaultValue={s.whatsapp_number ?? ""} inputMode="tel" className="input" />
            </Field>
            <Field label="Contact email"><input name="contact_email" type="email" defaultValue={s.contact_email ?? ""} className="input" /></Field>
            <Field label="Timezone" hint="All slots are shown in this timezone.">
              <input name="timezone" defaultValue={s.timezone} required className="input" />
            </Field>
          </div>
        </Section>

        <Section title="Tax" hint="Leave off unless you're GST-registered. When on, tax is added to the total and shown as its own line.">
          <div className="grid items-end gap-4 sm:grid-cols-3">
            <Toggle name="tax_enabled" label="Charge tax" defaultChecked={s.tax_enabled} />
            <Field label="Label"><input name="tax_label" defaultValue={s.tax_label} required className="input" /></Field>
            <Field label="Rate (%)"><input name="tax_percent" type="number" min={0} max={50} step="0.01" defaultValue={Number(s.tax_percent)} className="input" /></Field>
          </div>
        </Section>

        <div className="sticky bottom-0 -mx-5 border-t border-line bg-ground/95 px-5 py-4 backdrop-blur md:mx-0 md:px-0">
          <button className="btn btn-primary">Save settings</button>
        </div>
      </form>
    </>
  );
}
