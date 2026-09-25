// Builds the pre-filled WhatsApp message a customer sends to submit a booking.
// Until Phase 4 wires up real payment, this IS the booking flow's submit step:
// a fully priced, fully scheduled lead lands directly in WhatsApp instead of a
// vague DM, which is most of what the original brief's "reduce DM workload"
// goal was about in the first place.

import { formatLocalDateLong, formatLocalTime } from "./availability";
import { formatINR } from "./pricing";

export function buildBookingWhatsAppMessage(opts: {
  serviceName: string;
  durationLabel: string;
  dateStr: string;
  startISO: string;
  endISO: string;
  timezone: string;
  locationSummary: string;
  totalPaise: number;
  advancePaise: number;
  balancePaise: number;
  customerName: string;
  customerInstagram?: string;
  purpose?: string;
}): string {
  const lines = [
    "Hi! I'd like to book a shoot with EDITORWALABHAIYA.",
    "",
    `Shoot: ${opts.serviceName} · ${opts.durationLabel}`,
    `Date: ${formatLocalDateLong(opts.dateStr, opts.timezone)}`,
    `Time: ${formatLocalTime(opts.startISO, opts.timezone)} – ${formatLocalTime(opts.endISO, opts.timezone)}`,
    `Location: ${opts.locationSummary}`,
    "",
    `Total: ${formatINR(opts.totalPaise)}`,
    `Advance: ${formatINR(opts.advancePaise)}`,
    `Balance after shoot: ${formatINR(opts.balancePaise)}`,
    "",
    `Name: ${opts.customerName}`,
    opts.customerInstagram ? `Instagram: ${opts.customerInstagram}` : null,
    opts.purpose ? `Notes: ${opts.purpose}` : null,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** A wa.me link that opens WhatsApp with `message` pre-filled. */
export function whatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
