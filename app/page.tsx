import Link from "next/link";
import { loadBookingConfig } from "@/lib/config";
import { formatDuration, formatINR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const config = await loadBookingConfig();
  const { settings, services, durations, inclusions, locationOptions } = config;

  const activeDurations = durations.filter((d) => services.some((s) => s.id === d.service_id));
  const fromPaise = activeDurations.length ? Math.min(...activeDurations.map((d) => d.price_paise)) : null;
  const minDuration = activeDurations.length ? Math.min(...activeDurations.map((d) => d.minutes)) : null;
  const maxDuration = activeDurations.length ? Math.max(...activeDurations.map((d) => d.minutes)) : null;
  const included = inclusions.filter((i) => i.is_included);
  const notIncluded = inclusions.filter((i) => !i.is_included);
  const hasOutdoor = locationOptions.some((l) => l.setting === "outdoor");
  const hasIndoor = locationOptions.some((l) => l.setting === "indoor");

  const faqs = [
    { q: "How much do you charge?", a: fromPaise !== null ? `Shoots start from ${formatINR(fromPaise)}. Exact pricing depends on the shoot type, duration and location — pick your options on the booking page and see the total before you pay anything.` : "See the pricing below, or check the booking page for an exact quote." },
    { q: "Are you available on my date?", a: "Tap \u201cCheck availability\u201d below \u2014 the calendar only shows times I'm actually free, updated live." },
    { q: "How long is a shoot?", a: minDuration && maxDuration ? `Durations range from ${formatDuration(minDuration)} to ${formatDuration(maxDuration)}, depending on the shoot type you pick.` : "Pick a duration that fits your shoot on the booking page." },
    { q: "Do you shoot outdoors?", a: hasOutdoor && hasIndoor ? "Yes \u2014 both outdoor and indoor shoots are available. You'll choose which one when you book." : hasOutdoor ? "Yes, outdoor shoots are available." : "Indoor shoots are available \u2014 check the booking page for details." },
    { q: "How much advance do I pay?", a: `A ${settings.advance_percent}% advance confirms your date. The rest is due after the shoot, once you're happy with it.` },
    { q: "How do I book?", a: "Tap \u201cCheck availability,\u201d pick your shoot, duration, date and location, and you'll see the exact price before paying. No account needed." },
  ];

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

      {services.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Pricing</h2>
          <div className="flex flex-col gap-3">
            {services.map((s) => {
              const ds = durations.filter((d) => d.service_id === s.id);
              if (ds.length === 0) return null;
              return (
                <div key={s.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="text-sm font-semibold">{s.name}</div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {ds.map((d) => (
                      <div key={d.id} className="flex justify-between text-sm text-muted">
                        <span>{formatDuration(d.minutes)}</span>
                        <span className="text-paper">{formatINR(d.price_paise)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted">Location charges may apply depending on area — you&rsquo;ll see the exact total before paying.</p>
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

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Questions</h2>
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {faqs.map((f, i) => (
            <details key={i} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                {f.q}
                <span className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>

      <footer className="flex flex-col gap-2 pb-4 text-xs text-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/legal/cancellation" className="underline underline-offset-2">Cancellation policy</Link>
          <Link href="/legal/terms" className="underline underline-offset-2">Terms</Link>
          <Link href="/legal/refund" className="underline underline-offset-2">Refund policy</Link>
          <Link href="/legal/privacy" className="underline underline-offset-2">Privacy</Link>
        </div>
        {settings.contact_email && <span>{settings.contact_email}</span>}
      </footer>

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
