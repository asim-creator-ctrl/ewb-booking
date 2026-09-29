// Shapes of the live configuration, as read from the database.

export type Settings = {
  brand_name: string;
  tagline: string;
  contact_email: string | null;
  instagram_username: string;
  whatsapp_number: string | null;
  timezone: string;
  currency: string;
  booking_enabled: boolean;
  advance_percent: number;
  buffer_minutes: number;
  hold_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  slot_interval_minutes: number;
  tax_enabled: boolean;
  tax_label: string;
  tax_percent: number;
  hero_image_url: string | null;
  hero_image_position_x: number;
  hero_image_position_y: number;
  hero_image_zoom: number;
  bg_image_url: string | null;
  download_expiry_minutes: number;
  download_max_downloads: number;
};

export type Service = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sort: number;
};

export type ServiceDuration = {
  id: string;
  service_id: string;
  minutes: number;
  price_paise: number;
  active: boolean;
  sort: number;
};

export type LocationOption = {
  id: string;
  setting: "indoor" | "outdoor";
  label: string;
  charge_type: "included" | "fixed" | "quote";
  amount_paise: number;
  uses_zone: boolean;
  note: string | null;
  active: boolean;
  sort: number;
};

export type LocationZone = {
  id: string;
  name: string;
  description: string | null;
  charge_paise: number;
  requires_quote: boolean;
  active: boolean;
  sort: number;
};

export type Inclusion = {
  id: string;
  text: string;
  is_included: boolean;
  active: boolean;
  sort: number;
};

// ─────────────────────────────────────────────────────────────
// Digital products (Phase 2)
// ─────────────────────────────────────────────────────────────
export type Product = {
  id: string;
  slug: string;
  name: string;
  badge: string | null;
  short_description: string | null;
  description: string | null;
  includes: string[];
  price_paise: number;
  compare_at_price_paise: number | null;
  thumbnail_url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  featured: boolean;
  active: boolean;
  sort: number;
};

// ─────────────────────────────────────────────────────────────
// Discount coupons
// ─────────────────────────────────────────────────────────────
export type Coupon = {
  id: string;
  code: string;
  discount_percent: number;
  service_ids: string[];
  valid_from: string;
  valid_until: string;
  active: boolean;
  auto_apply: boolean;
  times_used: number;
};

// A currently-live, auto-apply coupon for one service — the badge shown on
// the shoot-selection card and the discount applied the moment that service
// is picked, with no code to type. Computed server-side in lib/config.ts
// (date range + active already filtered), one entry per service at most
// (the best discount wins if more than one auto coupon covers it).
export type ServiceOffer = {
  service_id: string;
  code: string;
  discount_percent: number;
};

export type BookingConfig = {
  settings: Settings;
  services: Service[];
  durations: ServiceDuration[];
  locationOptions: LocationOption[];
  zones: LocationZone[];
  inclusions: Inclusion[];
  offers: ServiceOffer[];
};
