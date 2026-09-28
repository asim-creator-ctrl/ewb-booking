-- Auto-apply coupons: same coupon row as always (code, %, services, date
-- range), plus a flag that skips the code-entry step entirely — shown as a
-- badge directly on the service card and applied the moment that service is
-- picked. Still re-validated server-side exactly like a typed code (see
-- lib/coupons.ts's validateCoupon, used by /api/quote and createBookingHold),
-- so an expired or deactivated auto-offer can never slip into a real charge.
alter table coupons add column if not exists auto_apply boolean not null default false;
