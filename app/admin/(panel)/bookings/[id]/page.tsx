import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { computeBalanceOwed } from "@/lib/bookings";
import { formatDuration, formatINR } from "@/lib/pricing";
import { formatLocalDateLong, formatLocalTime, zonedDateStr } from "@/lib/availability";
import { whatsappLink } from "@/lib/whatsapp";
import { ConfirmButton } from "@/components/confirm-button";
import { Field, Flash, PageHead, Row, Section, Toggle } from "@/components/ui";
import {
  addBookingCharge, cancelBookingAction, markBalancePaidManually, markBookingCompleted,
  rescheduleBookingAction, sendBalanceLinkAction, updateBookingNotes,
} from "../actions";

type Customer = { full_name: string; instagram: string | null; whatsapp: string; email: string };
type BookingItem = { id: string; kind: string; label: string; amount_paise: number; created_at: string };
type Payment = { id: string; kind: string; gateway: string; amount_paise: number; status: string; method: string | null; created_at: string };

export default async function BookingDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; link?: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { ok, error, link } = await searchParams;

  const { data: settings } = await supabase.from("settings").select("timezone").eq("id", 1).single();
  const tz = settings?.timezone ?? "Asia/Kolkata";

  const { data: booking } = await supabase.from("bookings")
    .select("id, ref, service_name, duration_minutes, starts_at, ends_at, status, payment_status, total_paise, advance_paise, location, purpose, admin_notes, customer_id, customers(full_name, instagram, whatsapp, email)")
    .eq("id", id).maybeSingle();
  if (!booking) notFound();

  const customer = (Array.isArray(booking.customers) ? booking.customers[0] : booking.customers) as Customer | null;
  const [{ data: items }, { data: payments }, balanceOwed] = await Promise.all([
    supabase.from("booking_items").select("id, kind, label, amount_paise, created_at").eq("booking_id", id).order("created_at").returns<BookingItem[]>(),
    supabase.from("payments").select("id, kind, gateway, amount_paise, status, method, created_at").eq("booking_id", id).order("created_at").returns<Payment[]>(),
    computeBalanceOwed(supabase, id),
  ]);

  const loc = booking.location as { setting?: string; label?: string; zone?: string | null; address?: string | null } | null;
  const locationSummary = loc ? `${loc.setting === "outdoor" ? "Outdoor" : "Indoor"} · ${loc.label ?? ""}${loc.zone ? `, ${loc.zone}` : ""}${loc.address ? ` (${loc.address})` : ""}` : "—";
  const isActive = booking.status === "held" || booking.status === "confirmed";
  const canComplete = booking.status === "confirmed";
  const canCancel = isActive;

  const waMessage = link ? `Hi ${customer?.full_name ?? ""}! Here's the link to pay the balance for your shoot: ${link}` : "";
  const waLink = link && customer?.whatsapp ? whatsappLink(customer.whatsapp, waMessage) : null;

  return (
    <>
      <PageHead title={`${customer?.full_name ?? "Booking"} — ${booking.service_name}`}>
        {booking.ref ?? "Not yet confirmed"} · {formatLocalDateLong(zonedDateStr(new Date(booking.starts_at), tz), tz)}, {formatLocalTime(booking.starts_at, tz)} – {formatLocalTime(booking.ends_at, tz)}
      </PageHead>
      <Flash ok={ok} error={error} />

      {link && (
        <div className="mb-6 max-w-2xl rounded-xl border border-safelight/40 bg-safelight/10 p-4 text-sm">
          <p className="mb-2 font-medium text-safelight">Payment link ready</p>
          <p className="mb-3 break-all rounded-lg bg-ground px-3 py-2 text-xs">{link}</p>
          {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary">Send on WhatsApp</a>}
        </div>
      )}

      <div className="grid max-w-4xl gap-8 md:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-8">
          <Section title="Shoot">
            <Row>
              <div className="flex flex-col gap-1.5 text-sm">
                <div><span className="text-muted">Service:</span> {booking.service_name} · {formatDuration(booking.duration_minutes)}</div>
                <div><span className="text-muted">Location:</span> {locationSummary}</div>
                {booking.purpose && <div><span className="text-muted">Notes from customer:</span> {booking.purpose}</div>}
                <div><span className="text-muted">Status:</span> {booking.status.replace("_", " ")} · {booking.payment_status.replace("_", " ")}</div>
              </div>
            </Row>
          </Section>

          <Section title="Customer">
            <Row>
              <div className="flex flex-col gap-1.5 text-sm">
                <div>{customer?.full_name}</div>
                {customer?.instagram && <div className="text-muted">{customer.instagram}</div>}
                <div className="text-muted">{customer?.whatsapp} · {customer?.email}</div>
              </div>
            </Row>
          </Section>

          <Section title="Price">
            <Row>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Total</span><span>{formatINR(booking.total_paise)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Advance paid</span><span>{formatINR(booking.advance_paise)}</span></div>
                {(items ?? []).map((it) => (
                  <div key={it.id} className="flex justify-between"><span className="text-muted">{it.label}</span><span className={it.kind === "discount" ? "text-ok" : ""}>{it.kind === "discount" ? "− " : "+ "}{formatINR(it.amount_paise)}</span></div>
                ))}
                <div className="h-px bg-line" />
                <div className="flex justify-between font-semibold"><span>Balance owed</span><span className={balanceOwed > 0 ? "text-safelight" : "text-ok"}>{formatINR(balanceOwed)}</span></div>
              </div>
            </Row>

            {isActive && (
              <div className="mt-3 flex flex-col gap-3">
                <form action={addBookingCharge} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-dashed border-line p-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Field label="Description"><input name="label" required placeholder="e.g. Studio rental" className="input" /></Field>
                  <Field label="Amount (₹)"><input name="amount" type="number" step="0.01" min="0.01" required className="input" /></Field>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="extra" defaultChecked className="accent-safelight" />Extra</label>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="kind" value="discount" className="accent-safelight" />Discount</label>
                  <button className="btn btn-quiet col-span-2 sm:col-span-4">Add</button>
                </form>

                {balanceOwed > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <form action={sendBalanceLinkAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button className="btn btn-primary">Send balance payment link</button>
                    </form>
                    <form className="flex items-center gap-2">
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <input type="hidden" name="amount" value={(balanceOwed / 100).toString()} />
                      <ConfirmButton formAction={markBalancePaidManually} message={`Mark ${formatINR(balanceOwed)} as paid manually (cash/UPI)?`}>
                        Mark {formatINR(balanceOwed)} as paid
                      </ConfirmButton>
                    </form>
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="Payment history">
            {(payments ?? []).length === 0 ? <p className="text-sm text-muted">No payments yet.</p> : (
              <div className="flex flex-col gap-2">
                {(payments ?? []).map((p) => (
                  <Row key={p.id}>
                    <div className="flex justify-between text-sm">
                      <span>{p.kind} · {p.gateway}{p.method ? ` (${p.method})` : ""}</span>
                      <span>{formatINR(p.amount_paise)} · {p.status}</span>
                    </div>
                  </Row>
                ))}
              </div>
            )}
          </Section>

          <Section title="Admin notes" hint="Private — never shown to the customer.">
            <form action={updateBookingNotes} className="flex flex-col gap-2">
              <input type="hidden" name="bookingId" value={booking.id} />
              <textarea name="admin_notes" rows={4} defaultValue={booking.admin_notes ?? ""} className="input" />
              <div><button className="btn btn-quiet">Save notes</button></div>
            </form>
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Actions">
            <div className="flex flex-col gap-3">
              {isActive && (
                <form action={rescheduleBookingAction} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
                  <div className="text-sm font-medium">Reschedule</div>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Field label="New date"><input type="date" name="date" required className="input" /></Field>
                  <Field label="New start time"><input type="time" name="time" required className="input" /></Field>
                  <button className="btn btn-quiet">Reschedule</button>
                </form>
              )}

              {canComplete && (
                <form action={markBookingCompleted}>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <button className="btn btn-quiet w-full">Mark shoot as completed</button>
                </form>
              )}

              {canCancel && (
                <form className="flex flex-col gap-2 rounded-xl border border-danger/30 p-3">
                  <div className="text-sm font-medium text-danger">Cancel booking</div>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <Field label="Reason (optional)"><input name="reason" className="input" /></Field>
                  <Toggle name="refund" label="Refund the advance" defaultChecked={false} />
                  <ConfirmButton formAction={cancelBookingAction} message="Cancel this booking? This can't be undone.">Cancel booking</ConfirmButton>
                </form>
              )}
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
