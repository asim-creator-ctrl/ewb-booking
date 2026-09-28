-- Digital products store — Phase 2.
-- Products are sold as a single downloadable file (a zip of Lightroom
-- presets, typically), delivered from a private storage bucket. Phase 3
-- wires up Razorpay checkout and short-lived, per-buyer download links using
-- the purchases/download_tokens tables below; they're created now so the
-- whole store schema lands in one migration, per the approved plan.

create table products (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text not null unique,
  name                    text not null,
  badge                   text,               -- e.g. "5 PRESETS · .XMP & .DNG"
  short_description       text,               -- one line, shown on the product card
  description             text,               -- longer "about this pack" copy
  includes                text[] not null default '{}',   -- "what's included" checklist
  price_paise             int not null check (price_paise >= 0),
  compare_at_price_paise  int check (compare_at_price_paise is null or compare_at_price_paise >= price_paise),
  thumbnail_url           text,               -- public image, site-assets bucket
  file_path               text,               -- object path in the private product-files bucket
  file_name               text,               -- original filename, shown to the buyer
  file_size_bytes         bigint,
  featured                boolean not null default false,  -- shows a "BEST VALUE" badge
  active                  boolean not null default true,
  sort                    int not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger products_updated before update on products for each row execute function set_updated_at();
create index products_active_idx on products (active, sort);

-- Configurable from the admin panel (not env vars), per the approved plan.
alter table settings add column if not exists download_expiry_minutes int not null default 45
  check (download_expiry_minutes between 5 and 10080);
alter table settings add column if not exists download_max_downloads int not null default 3
  check (download_max_downloads between 1 and 20);

create table purchases (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id),
  product_name       text not null,       -- snapshot at time of purchase
  amount_paise       int not null check (amount_paise >= 0),
  buyer_email        text not null,
  buyer_name         text,
  gateway            text not null default 'razorpay',
  gateway_order_id   text unique,
  gateway_payment_id text unique,
  status             text not null default 'created',  -- created | paid | failed
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create index purchases_product_idx on purchases (product_id);
create index purchases_email_idx on purchases (lower(buyer_email));

create table download_tokens (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references purchases(id) on delete cascade,
  token          text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at     timestamptz not null,
  max_downloads  int not null,
  downloads_used int not null default 0,
  created_at     timestamptz not null default now()
);
create index download_tokens_purchase_idx on download_tokens (purchase_id);

-- Private bucket: a preset pack is only ever reached through a signed
-- download-token link (Phase 3), never a public URL. Uploads happen via the
-- service-role client, same as every other write in this app.
insert into storage.buckets (id, name, public)
values ('product-files', 'product-files', false)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['products', 'purchases', 'download_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
