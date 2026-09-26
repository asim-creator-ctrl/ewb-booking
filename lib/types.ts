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

export type BookingConfig = {
  settings: Settings;
  services: Service[];
  durations: ServiceDuration[];
  locationOptions: LocationOption[];
  zones: LocationZone[];
  inclusions: Inclusion[];
};
