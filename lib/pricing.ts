// The single source of pricing truth.
// Pure function, no I/O: the browser runs it for the instant sticky total,
// the server re-runs it on the same live config before any payment is created.
// Whatever the browser shows, the server's result is what gets charged.

import type { BookingConfig } from "./types";

export type PriceSelection = {
  serviceId?: string | null;
  durationId?: string | null;
  locationOptionId?: string | null;
  zoneId?: string | null;
};

export type PriceLine = {
  kind: "base" | "location" | "zone" | "tax";
  label: string;
  amount_paise: number;
};

export type PriceNote = { kind: "not_included" | "quote"; text: string };

export type Quote = {
  ok: boolean;
  errors: string[];
  lines: PriceLine[];
  notes: PriceNote[];
  requires_quote: boolean;  // can't be paid online; needs a custom quote first
  subtotal_paise: number;
  tax_paise: number;
  total_paise: number;
  advance_percent: number;
  advance_paise: number;
  balance_paise: number;
};

/** Round to the nearest whole rupee (100 paise). */
export const roundToRupee = (paise: number) => Math.round(paise / 100) * 100;

export function calculatePrice(config: BookingConfig, sel: PriceSelection): Quote {
  const errors: string[] = [];
  const lines: PriceLine[] = [];
  const notes: PriceNote[] = [];
  let requiresQuote = false;

  const service = config.services.find((s) => s.id === sel.serviceId && s.active);
  if (!service) errors.push("Choose a shoot type.");

  const duration = config.durations.find(
    (d) => d.id === sel.durationId && d.active && d.service_id === service?.id,
  );
  if (service && !duration) errors.push("Choose a duration.");

  if (service && duration) {
    lines.push({
      kind: "base",
      label: `${service.name} · ${formatDuration(duration.minutes)}`,
      amount_paise: duration.price_paise,
    });
  }

  // Location is optional for a partial quote, but validated when given.
  if (sel.locationOptionId) {
    const loc = config.locationOptions.find((l) => l.id === sel.locationOptionId && l.active);
    if (!loc) {
      errors.push("That location option is no longer available.");
    } else {
      if (loc.charge_type === "fixed" && loc.amount_paise > 0) {
        lines.push({ kind: "location", label: loc.label, amount_paise: loc.amount_paise });
      }
      if (loc.charge_type === "quote") {
        // Booking still proceeds; the rental/venue cost is confirmed later as an extra charge.
        notes.push({ kind: "not_included", text: loc.note ?? `${loc.label} cost is not included in the shoot fee.` });
      } else if (loc.note) {
        notes.push({ kind: "not_included", text: loc.note });
      }

      if (loc.uses_zone) {
        const zone = config.zones.find((z) => z.id === sel.zoneId && z.active);
        if (!sel.zoneId) {
          errors.push("Choose the area of the shoot.");
        } else if (!zone) {
          errors.push("That area is no longer available.");
        } else if (zone.requires_quote) {
          requiresQuote = true;
          notes.push({ kind: "quote", text: `${zone.name} needs a custom quote before booking.` });
        } else if (zone.charge_paise > 0) {
          lines.push({ kind: "zone", label: `Travel · ${zone.name}`, amount_paise: zone.charge_paise });
        }
      }
    }
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount_paise, 0);

  const s = config.settings;
  const tax = s.tax_enabled ? roundToRupee((subtotal * Number(s.tax_percent)) / 100) : 0;
  if (tax > 0) lines.push({ kind: "tax", label: `${s.tax_label} ${Number(s.tax_percent)}%`, amount_paise: tax });

  const total = subtotal + tax;
  const advancePercent = Number(s.advance_percent);
  const advance = roundToRupee((total * advancePercent) / 100);

  return {
    ok: errors.length === 0 && !requiresQuote && total > 0,
    errors,
    lines,
    notes,
    requires_quote: requiresQuote,
    subtotal_paise: subtotal,
    tax_paise: tax,
    total_paise: total,
    advance_percent: advancePercent,
    advance_paise: advance,
    balance_paise: total - advance,
  };
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${m} min`;
}

export function formatINR(paise: number) {
  const rupees = paise / 100;
  return "₹" + rupees.toLocaleString("en-IN", { maximumFractionDigits: rupees % 1 ? 2 : 0 });
}
