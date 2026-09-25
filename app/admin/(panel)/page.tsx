import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadBookingConfig } from "@/lib/config";
import { PageHead, Section } from "@/components/ui";
import { PricePreview } from "@/components/price-preview";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { supabase } = await requireAdmin();
  const [config, { data: hours }] = await Promise.all([
    loadBookingConfig(),
    supabase.from("weekly_hours").select("weekday"),
  ]);
  const workingDays = new Set((hours ?? []).map((h) => h.weekday)).size;
  const included = config.inclusions.filter((i) => i.is_included).length;

  const checks = [
    { ok: config.services.length > 0, text: `${config.services.length} shoot types offered`, href: "/admin/services" },
    { ok: config.durations.length > 0, text: `${config.durations.length} durations priced`, href: "/admin/services" },
    { ok: config.zones.length > 0, text: `${config.zones.length} areas set up`, href: "/admin/locations" },
    { ok: workingDays > 0, text: `Working ${workingDays} days a week`, href: "/admin/hours" },
    { ok: included > 0, text: `${included} things listed as included`, href: "/admin/inclusions" },
    { ok: !!config.settings.whatsapp_number, text: config.settings.whatsapp_number ? "WhatsApp number set" : "Add your WhatsApp number", href: "/admin/settings" },
  ];

  return (
    <>
      <PageHead title="Overview">
        Bookings, revenue and today&rsquo;s shoots appear here once payments are live.
        {!config.settings.booking_enabled && " New bookings are currently paused."}
      </PageHead>

      <div className="max-w-5xl">
        <Section title="Price preview" hint="Exactly what a customer will see for these choices, using your live prices.">
          <PricePreview config={config} />
        </Section>

        <Section title="Setup">
          <ul className="grid gap-2 sm:grid-cols-2">
            {checks.map((c) => (
              <li key={c.text}>
                <Link href={c.href} className="flex items-center gap-3 rounded-lg border border-line px-4 py-3 text-sm hover:border-muted">
                  <span aria-hidden className={`size-2 rounded-full ${c.ok ? "bg-ok" : "bg-safelight"}`} />
                  {c.text}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
