// Loads the live booking configuration straight from the database on every call.
// No build-time constants, no long-lived cache: an admin save is visible on the
// very next customer request.
import "server-only";
import { createServiceClient } from "./supabase/service";
import type { BookingConfig } from "./types";

export async function loadBookingConfig(opts: { includeInactive?: boolean } = {}): Promise<BookingConfig> {
  const db = createServiceClient();
  const activeOnly = !opts.includeInactive;

  const q = <T,>(table: string) => {
    let query = db.from(table).select("*").order("sort", { ascending: true });
    if (activeOnly) query = query.eq("active", true);
    return query.returns<T[]>();
  };

  const nowIso = new Date().toISOString();
  const offersQuery = db.from("coupons")
    .select("code, discount_percent, service_ids")
    .eq("active", true).eq("auto_apply", true)
    .lte("valid_from", nowIso).gt("valid_until", nowIso);

  const [settings, services, durations, locationOptions, zones, inclusions, offerRows] = await Promise.all([
    db.from("settings").select("*").eq("id", 1).single(),
    q<BookingConfig["services"][number]>("services"),
    q<BookingConfig["durations"][number]>("service_durations"),
    q<BookingConfig["locationOptions"][number]>("location_options"),
    q<BookingConfig["zones"][number]>("location_zones"),
    q<BookingConfig["inclusions"][number]>("inclusions"),
    offersQuery,
  ]);

  for (const r of [settings, services, durations, locationOptions, zones, inclusions, offerRows]) {
    if (r.error) throw new Error(`Could not load booking config: ${r.error.message}`);
  }

  const allServices = services.data ?? [];
  const serviceIds = new Set(allServices.map((s) => s.id));

  // Collapse to at most one offer per service — if two auto-apply coupons
  // somehow both cover it, the customer sees whichever discount is bigger.
  const bestOfferByService = new Map<string, BookingConfig["offers"][number]>();
  for (const row of offerRows.data ?? []) {
    for (const serviceId of row.service_ids as string[]) {
      if (!serviceIds.has(serviceId)) continue;
      const existing = bestOfferByService.get(serviceId);
      if (!existing || row.discount_percent > existing.discount_percent) {
        bestOfferByService.set(serviceId, { service_id: serviceId, code: row.code, discount_percent: Number(row.discount_percent) });
      }
    }
  }

  return {
    settings: settings.data,
    services: allServices,
    // a duration is only offered if its parent service is offered
    durations: (durations.data ?? []).filter((d) => !activeOnly || serviceIds.has(d.service_id)),
    locationOptions: locationOptions.data ?? [],
    zones: zones.data ?? [],
    inclusions: inclusions.data ?? [],
    offers: [...bestOfferByService.values()],
  };
}
