// Reserves a slot and opens a Razorpay order for its advance. Called when the
// customer taps "Pay advance" on the Review step.
import { NextResponse } from "next/server";
import { createBookingHold } from "@/lib/bookings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await createBookingHold(body);
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "slot_taken" ? 409 : 400 });
}
