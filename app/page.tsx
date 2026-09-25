import Link from "next/link";
import { loadBookingConfig } from "@/lib/config";
import { formatINR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = await loadBookingConfig();
  const { settings, services, durations, inclusions } = config;

  const activeDurations = durations.filter((d) => services.some((s) => s.id === d.service_id));
  const fromPaise = activeDurations.length ? Math.min(...activeDurations.map((d) => d.price_paise)) : null;
  const included = inclusions.filter((i) => i.is_included).slice(0, 4);
  const notIncluded = inclusions.filter((i) => !i.is_included).slice(0, 4);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-5 py-8 sm:max-w-lg">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg tracking-wide">{settings.brand_name}</span>
      </div>

      <div className="flex h-64 items-end rounded-sm border border-line bg-surface p-4 text-sm text-muted">
        [Your best portrait — full bleed]
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl leading-[1.05]">Let&rsquo;s create something worth remembering.</h1>
        <p className="text-muted">{settings.tagline || `Book a shoot with ${settings.brand_name}.`} See my free dates and your exact price before you send anything.</p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">How it works</h2>
        {["Choose your shoot and duration", "Pick a free date and time", "See your exact price, no surprises", "Message me to lock it in — I'll confirm and we plan the shoot together"].map((t, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="w-5 shrink-0 font-semibold text-safelight">{i + 1}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>

      {fromPaise !== null && (
        <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-5">
          <div className="text-sm text-muted">Shoots from</div>
          <div className="font-display text-4xl">{formatINR(fromPaise)}</div>
          <div className="text-sm text-muted">{settings.advance_percent}% advance confirms your date. The rest is paid after the shoot.</div>
        </div>
      )}

      {(included.length > 0 || notIncluded.length > 0) && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1.5">
            <div className="font-semibold">Included</div>
            {included.map((i) => <div key={i.id} className="text-muted">{i.text}</div>)}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-semibold">Not included</div>
            {notIncluded.map((i) => <div key={i.id} className="text-muted">{i.text}</div>)}
          </div>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-auto border-t border-line bg-ground/95 px-5 py-4 backdrop-blur">
        {settings.booking_enabled ? (
          <Link href="/book" className="btn btn-primary block w-full text-center text-base">Check availability</Link>
        ) : (
          <div className="rounded-xl border border-line px-4 py-3 text-center text-sm text-muted">Not taking new bookings right now — check back soon.</div>
        )}
      </div>
    </main>
  );
}
