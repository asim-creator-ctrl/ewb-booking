// Server-side price. The browser's number is only ever a preview;
// holds and payments (Phase 4) are priced by this same calculation.
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadBookingConfig } from "@/lib/config";
import { calculatePrice } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const Body = z.object({
  serviceId: z.string().uuid().nullish(),
  durationId: z.string().uuid().nullish(),
  locationOptionId: z.string().uuid().nullish(),
  zoneId: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  const quote = calculatePrice(await loadBookingConfig(), parsed.data);
  return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
}
