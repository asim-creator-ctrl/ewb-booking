// Records a 'created' purchase and opens a Razorpay order for it. Called
// when the buyer taps "Buy now" on a product page, after entering their email.
import { NextResponse } from "next/server";
import { createProductOrder } from "@/lib/downloads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await createProductOrder(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
