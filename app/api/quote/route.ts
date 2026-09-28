// Server-side price. The browser's number is only ever a preview;
// holds and payments (Phase 4) are priced by this same calculation.
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadBookingConfig } from "@/lib/config";
import { calculatePrice } from "@/lib/pricing";
import { validateCoupon } from "@/lib/coupons";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  serviceId: z.string().uuid().nullish(),
  durationId: z.string().uuid().nullish(),
  locationOptionId: z.string().uuid().nullish(),
  zoneId: z.string().uuid().nullish(),
  couponCode: z.string().trim().max(40).nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  const { couponCode, ...selection } = parsed.data;

  // Re-check the applied coupon on every authoritative quote — it may have
  // expired, been turned off, or never really matched this service in the
  // first place, regardless of what the browser is currently showing.
  let couponError: string | null = null;
  let couponDiscountPercent: number | null = null;
  let validatedCode: string | null = null;
  if (couponCode) {
    const result = await validateCoupon(createServiceClient(), couponCode, selection.serviceId);
    if (result.ok) { validatedCode = result.code; couponDiscountPercent = result.discountPercent; }
    else couponError = result.error;
  }

  const quote = calculatePrice(await loadBookingConfig(), { ...selection, couponCode: validatedCode, couponDiscountPercent });
  return NextResponse.json({ ...quote, couponError }, { headers: { "Cache-Control": "no-store" } });
}
