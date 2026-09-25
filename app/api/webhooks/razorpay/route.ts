// Razorpay's server-to-server notification. This is the durable path: it
// covers a payment that succeeded even if the customer's browser closed
// before the client-side verify call ran. Deduplicated via webhook_events so
// a redelivered event is a safe no-op, and confirmBookingByOrderId is itself
// idempotent, so this can run concurrently with the client verify call too.
import crypto from "crypto";
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { confirmBookingByOrderId } from "@/lib/bookings";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: Record<string, unknown> } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Prefer Razorpay's own delivery id when present; otherwise a hash of the
  // body is just as good a dedupe key, since a genuine redelivery repeats it exactly.
  const eventId = req.headers.get("x-razorpay-event-id") ?? crypto.createHash("sha256").update(rawBody).digest("hex");
  const db = createServiceClient();

  const { error: dupeErr } = await db.from("webhook_events").insert({
    gateway: "razorpay", gateway_event_id: eventId, event_type: event.event ?? "unknown", payload: event,
  });
  if (dupeErr) return NextResponse.json({ ok: true, deduped: true }); // unique violation = already handled

  try {
    const payment = event.payload?.payment?.entity;
    if (event.event === "payment.captured" || event.event === "order.paid") {
      if (payment?.order_id && payment?.id) {
        await confirmBookingByOrderId(db, {
          gatewayOrderId: String(payment.order_id), gatewayPaymentId: String(payment.id),
          method: payment.method ? String(payment.method) : undefined,
        });
      }
    } else if (event.event === "payment.failed") {
      if (payment?.order_id) {
        await db.from("payments").update({ status: "failed" }).eq("gateway_order_id", String(payment.order_id)).eq("kind", "advance");
      }
    }
    await db.from("webhook_events").update({ processed_at: new Date().toISOString() }).eq("gateway_event_id", eventId);
  } catch (e) {
    await db.from("webhook_events").update({ error: String(e) }).eq("gateway_event_id", eventId);
  }

  return NextResponse.json({ ok: true });
}
