// Called by the browser right after Razorpay Checkout succeeds. The webhook
// (below) is the durable source of truth in case the browser closes before
// this call completes — confirmBookingByOrderId is safe to run from both.
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPaymentSignature } from "@/lib/razorpay";
import { confirmBookingByOrderId } from "@/lib/bookings";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ ok: false, error: "Could not verify that payment." }, { status: 400 });
  }

  const result = await confirmBookingByOrderId(createServiceClient(), {
    gatewayOrderId: razorpay_order_id, gatewayPaymentId: razorpay_payment_id,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : "conflict" in result && result.conflict ? 409 : 400 });
}
