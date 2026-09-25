// What the booking page reads. Always live: never cached.
import { NextResponse } from "next/server";
import { loadBookingConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = await loadBookingConfig();
  const { settings } = config;
  return NextResponse.json(
    {
      ...config,
      // only the settings the public page needs
      settings: {
        brand_name: settings.brand_name, tagline: settings.tagline, instagram_username: settings.instagram_username,
        whatsapp_number: settings.whatsapp_number, contact_email: settings.contact_email, timezone: settings.timezone,
        currency: settings.currency, booking_enabled: settings.booking_enabled, advance_percent: settings.advance_percent,
        hold_minutes: settings.hold_minutes, min_notice_hours: settings.min_notice_hours, max_days_ahead: settings.max_days_ahead,
        slot_interval_minutes: settings.slot_interval_minutes, buffer_minutes: settings.buffer_minutes,
        tax_enabled: settings.tax_enabled, tax_label: settings.tax_label, tax_percent: settings.tax_percent,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
