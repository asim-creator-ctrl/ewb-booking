-- Stacking: a booking can now carry BOTH an auto-apply offer (picked up
-- automatically from the service card, no code typed) AND a manually typed
-- coupon on top of it — two independent percentage discounts, each
-- re-validated server-side and each counted toward its own coupon's
-- times_used (see lib/bookings.ts). coupon_code alone used to be the only
-- discount a booking could carry; offer_code is the same idea for the
-- automatic one, kept separate so the two are never confused with each
-- other in the admin views or usage counts.
alter table bookings add column if not exists offer_code text;
