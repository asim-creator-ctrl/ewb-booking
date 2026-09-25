-- EDITORWALABHAIYA booking system — core schema
-- Money: integer paise. Time: timestamptz (UTC). Business timezone lives in settings.

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ─────────────────────────────────────────────────────────────
-- Admins (Supabase Auth users on an allow-list)
-- ─────────────────────────────────────────────────────────────
create table admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ─────────────────────────────────────────────────────────────
-- Settings (single row)
-- ─────────────────────────────────────────────────────────────
create table settings (
  id                    int primary key default 1 check (id = 1),
  brand_name            text not null default 'EDITORWALABHAIYA',
  tagline               text not null default 'Photographer | Content Creator | Traveller',
  contact_email         text,
  instagram_username    text not null default 'editorwalabhaiya',
  whatsapp_number       text,
  timezone              text not null default 'Asia/Kolkata',
  currency              text not null default 'INR',
  booking_enabled       boolean not null default true,
  advance_percent       numeric(5,2) not null default 50 check (advance_percent > 0 and advance_percent <= 100),
  buffer_minutes        int not null default 30  check (buffer_minutes between 0 and 480),
  hold_minutes          int not null default 15  check (hold_minutes between 5 and 60),
  min_notice_hours      int not null default 24  check (min_notice_hours between 0 and 720),
  max_days_ahead        int not null default 60  check (max_days_ahead between 1 and 365),
  slot_interval_minutes int not null default 30  check (slot_interval_minutes in (15, 30, 60)),
  tax_enabled           boolean not null default false,
  tax_label             text not null default 'GST',
  tax_percent           numeric(5,2) not null default 18 check (tax_percent >= 0 and tax_percent <= 50),
  updated_at            timestamptz not null default now()
);
create trigger settings_updated before update on settings for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Services & durations
-- ─────────────────────────────────────────────────────────────
create table services (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger services_updated before update on services for each row execute function set_updated_at();

create table service_durations (
  id           uuid primary key default gen_random_uuid(),
  service_id   uuid not null references services(id) on delete cascade,
  minutes      int not null check (minutes > 0 and minutes <= 720),
  price_paise  int not null check (price_paise >= 0),
  active       boolean not null default true,
  sort         int not null default 0,
  unique (service_id, minutes)
);

-- ─────────────────────────────────────────────────────────────
-- Locations
-- ─────────────────────────────────────────────────────────────
create type location_setting as enum ('indoor', 'outdoor');
create type charge_type      as enum ('included', 'fixed', 'quote');

-- What the customer picks: "Outdoor", "Your place", "Studio", "Other"
create table location_options (
  id            uuid primary key default gen_random_uuid(),
  setting       location_setting not null,
  label         text not null,
  charge_type   charge_type not null default 'included',
  amount_paise  int not null default 0 check (amount_paise >= 0),
  uses_zone     boolean not null default true,   -- apply area/zone charge on top
  note          text,                             -- e.g. "Studio rental not included"
  active        boolean not null default true,
  sort          int not null default 0
);

-- Area-based travel/location pricing (v1 stand-in for distance pricing)
create table location_zones (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text,
  charge_paise   int not null default 0 check (charge_paise >= 0),
  requires_quote boolean not null default false,  -- e.g. "Outside Kolkata"
  active         boolean not null default true,
  sort           int not null default 0
);

-- ─────────────────────────────────────────────────────────────
-- Included / not-included lists, extra-charge catalogue
-- ─────────────────────────────────────────────────────────────
create table inclusions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  is_included boolean not null,
  active      boolean not null default true,
  sort        int not null default 0
);

create table charge_items (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,            -- Studio rental, Travel, Props, Permit…
  description          text,
  default_amount_paise int check (default_amount_paise is null or default_amount_paise >= 0),
  active               boolean not null default true,
  sort                 int not null default 0
);

-- ─────────────────────────────────────────────────────────────
-- Availability
-- ─────────────────────────────────────────────────────────────
-- Several rows per weekday = working windows with breaks between them.
-- Times are in settings.timezone. weekday: 0 = Sunday … 6 = Saturday
create table weekly_hours (
  id         uuid primary key default gen_random_uuid(),
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time)
);

create table blocks (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index blocks_range_idx on blocks using gist (tstzrange(starts_at, ends_at, '[)'));

-- ─────────────────────────────────────────────────────────────
-- Customers & bookings
-- ─────────────────────────────────────────────────────────────
create table customers (
  id         uuid primary key default gen_random_uuid(),
  full_name  text not null,
  instagram  text,
  whatsapp   text not null,
  email      text not null,
  created_at timestamptz not null default now()
);
create index customers_email_idx on customers (lower(email));

create type booking_status as enum (
  'held', 'expired', 'confirmed', 'payment_conflict',
  'completed', 'closed', 'cancelled', 'no_show'
);
create type payment_status as enum (
  'unpaid', 'advance_paid', 'balance_pending', 'fully_paid',
  'partially_refunded', 'refunded'
);

create type policy_type as enum ('cancellation', 'rescheduling', 'terms', 'privacy', 'refund');
create table policies (
  id         uuid primary key default gen_random_uuid(),
  type       policy_type not null,
  version    int not null,
  title      text not null,
  body       text not null,
  active     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (type, version)
);
-- only one active version per type
create unique index policies_one_active on policies (type) where active;

create sequence booking_ref_seq start 1001;

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  ref               text unique,                      -- EWB-2026-1048, assigned on confirmation
  customer_id       uuid references customers(id),
  service_id        uuid references services(id),
  service_name      text not null,                    -- snapshot
  duration_minutes  int not null check (duration_minutes > 0),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  buffer_minutes    int not null default 0,           -- snapshot of settings at booking time
  blocked_range     tstzrange,                        -- set by trigger: [start, end + buffer)
  status            booking_status not null default 'held',
  payment_status    payment_status not null default 'unpaid',
  hold_expires_at   timestamptz,
  location          jsonb not null default '{}'::jsonb,
  pricing_snapshot  jsonb not null default '{}'::jsonb,
  total_paise       int not null check (total_paise >= 0),
  advance_paise     int not null check (advance_paise >= 0),
  policy_ids        uuid[] not null default '{}',
  purpose           text,
  customer_notes    text,
  reference_link    text,
  admin_notes       text,
  manage_token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

create or replace function bookings_set_range() returns trigger
language plpgsql as $$
begin
  new.blocked_range := tstzrange(new.starts_at, new.ends_at + make_interval(mins => new.buffer_minutes), '[)');
  return new;
end $$;
create trigger bookings_range before insert or update of starts_at, ends_at, buffer_minutes
  on bookings for each row execute function bookings_set_range();
create trigger bookings_updated before update on bookings for each row execute function set_updated_at();

-- THE double-booking guard. Two live bookings can never overlap, enforced by Postgres itself.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (blocked_range with &&)
  where (status in ('held', 'confirmed', 'completed', 'closed'));

create index bookings_starts_idx on bookings (starts_at);
create index bookings_status_idx on bookings (status);

create or replace function next_booking_ref() returns text
language sql volatile as $$
  select 'EWB-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || nextval('booking_ref_seq')
$$;

create type item_kind as enum ('base', 'location', 'zone', 'extra', 'discount', 'tax', 'adjustment');
create table booking_items (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references bookings(id) on delete cascade,
  kind         item_kind not null,
  label        text not null,
  amount_paise int not null,                -- negative for discounts
  added_after_booking boolean not null default false,
  added_by     uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index booking_items_booking_idx on booking_items (booking_id);

-- ─────────────────────────────────────────────────────────────
-- Payments & webhooks
-- ─────────────────────────────────────────────────────────────
create type payment_kind as enum ('advance', 'balance', 'refund', 'manual');
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references bookings(id),
  kind               payment_kind not null,
  gateway            text not null default 'razorpay',
  gateway_order_id   text unique,
  gateway_payment_id text unique,
  gateway_link_id    text unique,
  amount_paise       int not null,
  status             text not null default 'created',   -- created | captured | failed | refunded
  method             text,                               -- upi | card | cash | …
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger payments_updated before update on payments for each row execute function set_updated_at();
create index payments_booking_idx on payments (booking_id);

create table webhook_events (
  id               uuid primary key default gen_random_uuid(),
  gateway          text not null default 'razorpay',
  gateway_event_id text not null unique,        -- idempotency: a duplicate insert fails
  event_type       text not null,
  payload          jsonb not null,
  processed_at     timestamptz,
  error            text,
  received_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Notifications & reminders
-- ─────────────────────────────────────────────────────────────
create table reminder_rules (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  offset_minutes int not null,                  -- negative = before shoot, positive = after
  template       text not null,
  channel        text not null default 'email',
  active         boolean not null default true
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id) on delete cascade,
  channel       text not null,                  -- email | telegram | whatsapp
  recipient     text not null,
  template      text not null,
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  status        text not null default 'pending',
  error         text,
  created_at    timestamptz not null default now()
);
create index notifications_due_idx on notifications (scheduled_for) where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- Audit log
-- ─────────────────────────────────────────────────────────────
create table audit_logs (
  id         bigint generated always as identity primary key,
  actor      uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- Customers never touch tables directly: all public reads/writes go through
-- server routes using the service-role key. Admin screens use the admin's
-- session, so RLS is a second lock behind the app's own checks.
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'admins','settings','services','service_durations','location_options','location_zones',
    'inclusions','charge_items','weekly_hours','blocks','customers','policies','bookings',
    'booking_items','payments','webhook_events','reminder_rules','notifications','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
