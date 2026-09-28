-- Discount coupons: percentage off, restricted to specific shoot types, only
-- valid within a date range. No usage cap by design — times_used is kept for
-- admin visibility only, never enforced.

create table coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  discount_percent  numeric not null check (discount_percent > 0 and discount_percent <= 100),
  service_ids       uuid[] not null default '{}' check (array_length(service_ids, 1) > 0),
  valid_from        timestamptz not null,
  valid_until       timestamptz not null check (valid_until > valid_from),
  active            boolean not null default true,
  times_used        int not null default 0,
  created_at        timestamptz not null default now()
);
create index coupons_code_idx on coupons (code);

alter table bookings add column if not exists coupon_code text;

-- Bumped from confirmBookingByOrderId once a booking with a coupon is
-- actually confirmed (not when it's merely held) — an atomic RPC so a
-- concurrent confirm never loses a count to a race.
create or replace function increment_coupon_usage(p_code text) returns void
language sql as $$
  update coupons set times_used = times_used + 1 where code = p_code;
$$;

alter table coupons enable row level security;
create policy admin_all on coupons for all to authenticated using (is_admin()) with check (is_admin());
