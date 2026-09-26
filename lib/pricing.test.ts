import { describe, expect, it } from "vitest";
import { calculatePrice, formatINR } from "./pricing";
import type { BookingConfig } from "./types";

const config: BookingConfig = {
  settings: {
    brand_name: "EDITORWALABHAIYA", tagline: "", contact_email: null, instagram_username: "editorwalabhaiya",
    whatsapp_number: null, timezone: "Asia/Kolkata", currency: "INR", booking_enabled: true,
    advance_percent: 50, buffer_minutes: 30, hold_minutes: 15, min_notice_hours: 24, max_days_ahead: 60,
    slot_interval_minutes: 30, tax_enabled: false, tax_label: "GST", tax_percent: 18, hero_image_url: null,
  },
  services: [
    { id: "photo", name: "Photography", description: null, active: true, sort: 1 },
    { id: "old", name: "Retired", description: null, active: false, sort: 2 },
  ],
  durations: [
    { id: "p1", service_id: "photo", minutes: 60, price_paise: 500000, active: true, sort: 1 },
    { id: "p2", service_id: "photo", minutes: 120, price_paise: 900000, active: false, sort: 2 },
    { id: "o1", service_id: "old", minutes: 60, price_paise: 100, active: true, sort: 1 },
  ],
  locationOptions: [
    { id: "out", setting: "outdoor", label: "Outdoor", charge_type: "included", amount_paise: 0, uses_zone: true, note: null, active: true, sort: 1 },
    { id: "fixed", setting: "outdoor", label: "Premium spot", charge_type: "fixed", amount_paise: 50000, uses_zone: false, note: null, active: true, sort: 2 },
    { id: "studio", setting: "indoor", label: "Studio", charge_type: "quote", amount_paise: 0, uses_zone: false, note: "Studio rental is not included.", active: true, sort: 3 },
  ],
  zones: [
    { id: "north", name: "North Kolkata", description: null, charge_paise: 0, requires_quote: false, active: true, sort: 1 },
    { id: "south", name: "South Kolkata", description: null, charge_paise: 50000, requires_quote: false, active: true, sort: 2 },
    { id: "outside", name: "Outside Kolkata", description: null, charge_paise: 0, requires_quote: true, active: true, sort: 3 },
  ],
  inclusions: [],
};

describe("calculatePrice", () => {
  it("matches the brief's example: ₹5,000 + ₹500 → ₹5,500 / ₹2,750 / ₹2,750", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1", locationOptionId: "out", zoneId: "south" });
    expect(q.ok).toBe(true);
    expect(q.total_paise).toBe(550000);
    expect(q.advance_paise).toBe(275000);
    expect(q.balance_paise).toBe(275000);
  });

  it("gives a partial quote before location is chosen", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1" });
    expect(q.total_paise).toBe(500000);
    expect(q.ok).toBe(true);
  });

  it("rejects disabled services, disabled durations and mismatched durations", () => {
    expect(calculatePrice(config, { serviceId: "old", durationId: "o1" }).ok).toBe(false);
    expect(calculatePrice(config, { serviceId: "photo", durationId: "p2" }).ok).toBe(false);
    expect(calculatePrice(config, { serviceId: "photo", durationId: "o1" }).ok).toBe(false);
  });

  it("adds fixed location charges", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1", locationOptionId: "fixed" });
    expect(q.total_paise).toBe(550000);
  });

  it("requires a zone when the location uses zones", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1", locationOptionId: "out" });
    expect(q.ok).toBe(false);
    expect(q.errors).toContain("Choose the area of the shoot.");
  });

  it("blocks online payment for quote-only zones", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1", locationOptionId: "out", zoneId: "outside" });
    expect(q.requires_quote).toBe(true);
    expect(q.ok).toBe(false);
  });

  it("keeps studio bookable but flags rental as not included", () => {
    const q = calculatePrice(config, { serviceId: "photo", durationId: "p1", locationOptionId: "studio" });
    expect(q.ok).toBe(true);
    expect(q.total_paise).toBe(500000);
    expect(q.notes[0]).toEqual({ kind: "not_included", text: "Studio rental is not included." });
  });

  it("follows the advance % setting and rounds to whole rupees", () => {
    const c = { ...config, settings: { ...config.settings, advance_percent: 33 } };
    const q = calculatePrice(c, { serviceId: "photo", durationId: "p1", locationOptionId: "out", zoneId: "north" });
    expect(q.advance_paise).toBe(165000);
    expect(q.advance_paise + q.balance_paise).toBe(q.total_paise);
    expect(q.advance_paise % 100).toBe(0);
  });

  it("adds tax only when enabled", () => {
    const c = { ...config, settings: { ...config.settings, tax_enabled: true } };
    const q = calculatePrice(c, { serviceId: "photo", durationId: "p1", locationOptionId: "out", zoneId: "north" });
    expect(q.tax_paise).toBe(90000);
    expect(q.total_paise).toBe(590000);
  });

  it("formats rupees Indian-style", () => {
    expect(formatINR(1300000)).toBe("₹13,000");
    expect(formatINR(10000000)).toBe("₹1,00,000");
  });
});
