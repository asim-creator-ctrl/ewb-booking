import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadBookingConfig } from "@/lib/config";
import { sweepExpiredHolds } from "@/lib/bookings";
import { formatINR } from "@/lib/pricing";
import { zonedDateStr } from "@/lib/availability";
import { PageHead, Section } from "@/components/ui";
import { PricePreview } from "@/components/price-preview";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { supabase } = await requireAdmin();
  await sweepExpiredHolds(supabase);
  const [config, { data: hours }] = await Promise.all([
    loadBookingConfig(),
    supabase.from("weekly_hours").select("weekday"),
  ]);
  const workingDays = new Set((hours ?? []).map((h) => h.weekday)).size;
  const included = config.inclusions.filter((i) => i.is_included).length;
  const tz = config.settings.timezone;

  const now = new Date();
  const todayStr = zonedDateStr(now, tz);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [{ count: todayCount }, { count: upcomingCount }, { count: pendingCount }, { data: monthPayments }, { data: owedBookings }] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true })
      .gte("starts_at", `${todayStr}T00:00:00Z`).lt("starts_at", `${todayStr}T23:59:59Z`).in("status", ["confirmed", "completed"]),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed").gte("starts_at", now.toISOString()),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "confirmed").in("payment_status", ["advance_paid", "balance_pending"]),
    supabase.from("payments").select("amount_paise").in("kind", ["advance", "balance"]).eq("status", "captured").gte("created_at", monthStart),
    supabase.from("bookings").select("total_paise, advance_paise").eq("status", "confirmed").in("payment_status", ["advance_paid", "balance_pending"]),
  ]);

  const monthRevenue = (monthPayments ?? []).reduce((sum, p) => sum + p.amount_paise, 0);
  const outstanding = (owedBookings ?? []).reduce((sum, b) => sum + Math.max(0, b.total_paise - b.advance_paise), 0);

  const stats = [
    { label: "Today's shoots", value: todayCount ?? 0, href: "/admin/bookings?filter=today" },
    { label: "Upcoming confirmed", value: upcomingCount ?? 0, href: "/admin/bookings?filter=upcoming" },
    { label: "Pending balance", value: pendingCount ?? 0, href: "/admin/bookings?filter=pending" },
    { label: "This month's revenue", value: formatINR(monthRevenue), href: "/admin/bookings" },
    { label: "Outstanding balance", value: formatINR(outstanding), href: "/admin/bookings?filter=pending" },
  ];

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
        {config.settings.booking_enabled ? "How the business looks right now." : "New bookings are currently paused."}
      </PageHead>

      <div className="max-w-5xl">
        <Section title="At a glance">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4 hover:border-muted">
                <span className="text-xs text-muted">{s.label}</span>
                <span className="font-display text-2xl">{s.value}</span>
              </Link>
            ))}
          </div>
        </Section>

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
