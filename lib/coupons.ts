// Validates a coupon code against the live coupons table. Always re-run
// server-side before trusting a discount — /api/coupons/validate uses this
// for the Review step's "Apply" button, /api/quote uses it to recompute the
// authoritative price, and createBookingHold uses it again right before
// money changes hands, exactly like every other re-check in lib/bookings.ts.
import "server-only";
import { createServiceClient } from "./supabase/service";

type Db = ReturnType<typeof createServiceClient>;

export type CouponCheck =
  | { ok: true; code: string; discountPercent: number }
  | { ok: false; error: string };

export async function validateCoupon(db: Db, rawCode: string, serviceId: string | null | undefined): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };
  if (!serviceId) return { ok: false, error: "Choose a shoot type first." };

  const { data: coupon } = await db.from("coupons")
    .select("code, discount_percent, service_ids, valid_from, valid_until, active")
    .eq("code", code).maybeSingle();
  if (!coupon || !coupon.active) return { ok: false, error: "That coupon code isn't valid." };

  const now = Date.now();
  if (now < new Date(coupon.valid_from).getTime()) return { ok: false, error: "That coupon isn't active yet." };
  if (now > new Date(coupon.valid_until).getTime()) return { ok: false, error: "That coupon has expired." };
  if (!(coupon.service_ids as string[]).includes(serviceId)) {
    return { ok: false, error: "That coupon doesn't apply to this shoot type." };
  }

  return { ok: true, code: coupon.code, discountPercent: Number(coupon.discount_percent) };
}
