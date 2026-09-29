import { NextResponse } from "next/server";
import { z } from "zod";
import { validateCoupon } from "@/lib/coupons";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  code: z.string().trim().min(1).max(40),
  serviceId: z.string().uuid(),
  /** The service's current auto-apply offer code, if any — typing that same code in manually is rejected. */
  excludeCode: z.string().trim().max(40).nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Enter a coupon code." }, { status: 400 });
  const result = await validateCoupon(createServiceClient(), parsed.data.code, parsed.data.serviceId, parsed.data.excludeCode);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
