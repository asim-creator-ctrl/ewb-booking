import { describe, expect, it } from "vitest";
import { buildBookingICS } from "./ics";

describe("buildBookingICS", () => {
  const base = {
    uid: "abc-123", summary: "EDITORWALABHAIYA — Photography", description: "Booking EWB-2026-1001",
    location: "Outdoor · North Kolkata", startISO: "2026-10-12T04:30:00.000Z", endISO: "2026-10-12T05:30:00.000Z",
    now: new Date("2026-09-25T00:00:00.000Z"),
  };

  it("produces a well-formed VCALENDAR/VEVENT block", () => {
    const ics = buildBookingICS(base);
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toMatch(/END:VCALENDAR$/);
  });

  it("formats start and end as UTC basic-format date-times", () => {
    const ics = buildBookingICS(base);
    expect(ics).toContain("DTSTART:20261012T043000Z");
    expect(ics).toContain("DTEND:20261012T053000Z");
  });

  it("escapes commas, semicolons and newlines in free-text fields", () => {
    const ics = buildBookingICS({ ...base, description: "Line one\nOutdoor; North, Kolkata" });
    expect(ics).toContain("DESCRIPTION:Line one\\nOutdoor\\; North\\, Kolkata");
  });

  it("includes an ORGANIZER line only when an email is given", () => {
    expect(buildBookingICS(base)).not.toContain("ORGANIZER:");
    expect(buildBookingICS({ ...base, organizerEmail: "asim@example.com" })).toContain("ORGANIZER:mailto:asim@example.com");
  });

  it("scopes the UID to this brand so it never collides with another calendar's event", () => {
    expect(buildBookingICS(base)).toContain("UID:abc-123@editorwalabhaiya");
  });
});
