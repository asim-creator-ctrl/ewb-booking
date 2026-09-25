import { describe, expect, it } from "vitest";
import { buildBookingWhatsAppMessage, whatsappLink } from "./whatsapp";

describe("buildBookingWhatsAppMessage", () => {
  const base = {
    serviceName: "Photography", durationLabel: "1 hour", dateStr: "2026-10-12",
    startISO: "2026-10-12T10:30:00.000Z", endISO: "2026-10-12T11:30:00.000Z", timezone: "Asia/Kolkata",
    locationSummary: "Outdoor · South Kolkata", totalPaise: 450000, advancePaise: 225000, balancePaise: 225000,
    customerName: "Priya",
  };

  it("includes the core shoot, price and contact details", () => {
    const msg = buildBookingWhatsAppMessage(base);
    expect(msg).toContain("Photography · 1 hour");
    expect(msg).toContain("Outdoor · South Kolkata");
    expect(msg).toContain("Total: ₹4,500");
    expect(msg).toContain("Advance: ₹2,250");
    expect(msg).toContain("Name: Priya");
  });

  it("omits optional fields when not given", () => {
    const msg = buildBookingWhatsAppMessage(base);
    expect(msg).not.toContain("Instagram:");
    expect(msg).not.toContain("Notes:");
  });

  it("includes optional fields when given", () => {
    const msg = buildBookingWhatsAppMessage({ ...base, customerInstagram: "@priya", purpose: "Birthday shoot" });
    expect(msg).toContain("Instagram: @priya");
    expect(msg).toContain("Notes: Birthday shoot");
  });
});

describe("whatsappLink", () => {
  it("strips non-digits and URL-encodes the message", () => {
    const link = whatsappLink("+91 6289 743 476", "Hi there");
    expect(link).toBe("https://wa.me/916289743476?text=Hi%20there");
  });
});
