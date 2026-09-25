"use server";

// Actions for a single booking: extra charges, balance payment links, manual
// balance confirmation, marking complete, cancelling (with optional refund),
// and rescheduling. Each re-checks admin rights, validates input, and
// audit-logs, matching the pattern in the main admin actions file.

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { cancelBooking, rescheduleBooking, sendBalanceLink } from "@/lib/bookings";
import { onBalancePaid } from "@/lib/notifications";

const rupees = z.coerce.number().min(0.01).max(10_000_000).transform((r) => Math.round(r * 100));
const uuid = z.string().uuid();

function fields(fd: FormData) {
  const o: Record<string, FormDataEntryValue> = {};
  fd.forEach((v, k) => { if (!k.startsWith("$")) o[k] = v; });
  return o;
}

function back(bookingId: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/admin/bookings/${bookingId}${qs ? `?${qs}` : ""}`);
}

const ChargeSchema = z.object({
  bookingId: uuid,
  kind: z.enum(["extra", "discount"]),
  label: z.string().trim().min(1).max(120),
  amount: rupees,
});

export async function addBookingCharge(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = ChargeSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: parsed.error.issues[0]?.message ?? "Check the amount." });
  const { bookingId, kind, label, amount } = parsed.data;

  const { error } = await supabase.from("booking_items").insert({
    booking_id: bookingId, kind, label, amount_paise: amount, added_after_booking: true, added_by: user.id,
  });
  if (error) return back(bookingId, { error: "Could not add that." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "create", entity: "booking_item", entity_id: bookingId, after: parsed.data });
  back(bookingId, { ok: kind === "extra" ? "Extra charge added." : "Discount added." });
}

const SendLinkSchema = z.object({ bookingId: uuid });
export async function sendBalanceLinkAction(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = SendLinkSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: "Invalid booking." });
  const result = await sendBalanceLink(supabase, parsed.data.bookingId);
  if (!result.ok) return back(parsed.data.bookingId, { error: result.error ?? "Could not create the payment link." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "create", entity: "payment_link", entity_id: parsed.data.bookingId });
  back(parsed.data.bookingId, { ok: "Payment link created — copy it below.", link: result.url ?? "" });
}

const MarkPaidSchema = z.object({ bookingId: uuid, amount: rupees });
export async function markBalancePaidManually(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = MarkPaidSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: parsed.error.issues[0]?.message ?? "Check the amount." });
  const { bookingId, amount } = parsed.data;

  const { error } = await supabase.from("payments").insert({ booking_id: bookingId, kind: "balance", gateway: "manual", amount_paise: amount, status: "captured" });
  if (error) return back(bookingId, { error: "Could not record that payment." });
  await supabase.from("bookings").update({ payment_status: "fully_paid" }).eq("id", bookingId);
  await onBalancePaid(supabase, bookingId);
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "booking", entity_id: bookingId, after: { payment_status: "fully_paid", manual_amount: amount } });
  back(bookingId, { ok: "Marked as fully paid." });
}

const MarkCompletedSchema = z.object({ bookingId: uuid });
export async function markBookingCompleted(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = MarkCompletedSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: "Invalid booking." });
  const { error } = await supabase.from("bookings").update({ status: "completed" }).eq("id", parsed.data.bookingId).eq("status", "confirmed");
  if (error) return back(parsed.data.bookingId, { error: "Could not mark as completed." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "booking", entity_id: parsed.data.bookingId, after: { status: "completed" } });
  back(parsed.data.bookingId, { ok: "Marked as completed." });
}

const CancelSchema = z.object({ bookingId: uuid, refund: z.preprocess((v) => v === "on", z.boolean()), reason: z.string().trim().max(300).nullish() });
export async function cancelBookingAction(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = CancelSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: "Invalid request." });
  const result = await cancelBooking(supabase, parsed.data.bookingId, { refund: parsed.data.refund, reason: parsed.data.reason || undefined });
  if (!result.ok) return back(parsed.data.bookingId, { error: result.error ?? "Could not cancel." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "booking", entity_id: parsed.data.bookingId, after: { status: "cancelled", refunded: parsed.data.refund } });
  back(parsed.data.bookingId, { ok: parsed.data.refund ? "Cancelled and refunded." : "Cancelled." });
}

const RescheduleSchema = z.object({ bookingId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) });
export async function rescheduleBookingAction(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = RescheduleSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: "Pick a valid date and time." });
  const result = await rescheduleBooking(supabase, parsed.data.bookingId, parsed.data.date, parsed.data.time);
  if (!result.ok) return back(parsed.data.bookingId, { error: result.error ?? "Could not reschedule." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "booking", entity_id: parsed.data.bookingId, after: { rescheduled_to: `${parsed.data.date} ${parsed.data.time}` } });
  back(parsed.data.bookingId, { ok: "Rescheduled." });
}

const NotesSchema = z.object({ bookingId: uuid, admin_notes: z.string().trim().max(2000) });
export async function updateBookingNotes(fd: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = NotesSchema.safeParse(fields(fd));
  if (!parsed.success) return back(String(fd.get("bookingId") ?? ""), { error: "Notes are too long." });
  const { error } = await supabase.from("bookings").update({ admin_notes: parsed.data.admin_notes || null }).eq("id", parsed.data.bookingId);
  if (error) return back(parsed.data.bookingId, { error: "Could not save notes." });
  await supabase.from("audit_logs").insert({ actor: user.id, action: "update", entity: "booking", entity_id: parsed.data.bookingId, after: { admin_notes: "updated" } });
  back(parsed.data.bookingId, { ok: "Notes saved." });
}
