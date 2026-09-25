import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDuration } from "@/lib/pricing";
import { formatLocalDateLong, formatLocalTime, zonedDateStr } from "@/lib/availability";
import { sweepExpiredHolds } from "@/lib/bookings";
import { PageHead } from "@/components/ui";

type Row = {
  id: string; ref: string | null; service_name: string; duration_minutes: number;
  starts_at: string; status: string; payment_status: string; total_paise: number;
  customers: { full_name: string } | { full_name: string }[] | null;
};

const FILTERS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "pending", label: "Pending balance" },
  { key: "all", label: "All" },
] as const;

const STATUS_COLOR: Record<string, string> = {
  held: "text-safelight", confirmed: "text-ok", completed: "text-muted",
  cancelled: "text-danger", expired: "text-muted", payment_conflict: "text-danger", no_show: "text-danger",
};

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { supabase } = await requireAdmin();
  await sweepExpiredHolds(supabase);
  const { filter: filterParam } = await searchParams;
  const filter = FILTERS.some((f) => f.key === filterParam) ? filterParam! : "upcoming";

  const { data: settings } = await supabase.from("settings").select("timezone").eq("id", 1).single();
  const tz = settings?.timezone ?? "Asia/Kolkata";
  const now = new Date();
  const todayStart = new Date(now); todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  let query = supabase.from("bookings")
    .select("id, ref, service_name, duration_minutes, starts_at, status, payment_status, total_paise, customers(full_name)")
    .order("starts_at", { ascending: filter !== "all" });

  if (filter === "upcoming") query = query.gte("starts_at", now.toISOString()).in("status", ["held", "confirmed"]);
  else if (filter === "today") query = query.gte("starts_at", todayStart.toISOString()).lt("starts_at", todayEnd.toISOString());
  else if (filter === "pending") query = query.in("payment_status", ["advance_paid", "balance_pending"]).eq("status", "confirmed");

  const { data: bookings } = await query.limit(100).returns<Row[]>();

  return (
    <>
      <PageHead title="Bookings">Every shoot, its payment status, and the actions you can take on it.</PageHead>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f.key} href={`/admin/bookings?filter=${f.key}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${filter === f.key ? "border-safelight text-safelight" : "border-line text-muted hover:text-paper"}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="flex max-w-3xl flex-col gap-2">
        {(bookings ?? []).length === 0 && <p className="text-sm text-muted">Nothing here yet.</p>}
        {(bookings ?? []).map((b) => {
          const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers;
          return (
            <Link key={b.id} href={`/admin/bookings/${b.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm hover:border-muted">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{customer?.full_name ?? "—"} · {b.service_name} ({formatDuration(b.duration_minutes)})</span>
                <span className="text-xs text-muted">{formatLocalDateLong(zonedDateStr(new Date(b.starts_at), tz), tz)} · {formatLocalTime(b.starts_at, tz)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {b.ref && <span className="text-muted">{b.ref}</span>}
                <span className={STATUS_COLOR[b.status] ?? "text-muted"}>{b.status.replace("_", " ")}</span>
                <span className="text-muted">{b.payment_status.replace("_", " ")}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
