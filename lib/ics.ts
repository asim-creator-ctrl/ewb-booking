// Builds a minimal RFC 5545 .ics calendar invite for a confirmed shoot.
// Pure and dependency-free so it's directly testable — no server-only, no network.

const pad = (n: number) => String(n).padStart(2, "0");

function toICSDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Escapes text per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildBookingICS(opts: {
  uid: string;
  summary: string;
  description: string;
  location: string;
  startISO: string;
  endISO: string;
  organizerEmail?: string;
  now?: Date; // injectable for tests; defaults to the real current time
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EDITORWALABHAIYA//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@editorwalabhaiya`,
    `DTSTAMP:${toICSDate((opts.now ?? new Date()).toISOString())}`,
    `DTSTART:${toICSDate(opts.startISO)}`,
    `DTEND:${toICSDate(opts.endISO)}`,
    `SUMMARY:${escapeText(opts.summary)}`,
    `DESCRIPTION:${escapeText(opts.description)}`,
    `LOCATION:${escapeText(opts.location)}`,
    opts.organizerEmail ? `ORGANIZER:mailto:${opts.organizerEmail}` : null,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.filter((l): l is string => l !== null).join("\r\n");
}
