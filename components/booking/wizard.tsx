"use client";

// The actual booking flow. Selections drive `calculatePrice` directly for the
// instant sticky total (same pure function the admin's price preview uses),
// and the Date step calls the live availability API so what's offered is
// always real. A coupon typed on Review is checked against the server twice
// more before it ever discounts a real payment: once on the authoritative
// /api/quote refresh, and again inside createBookingHold. An auto-apply
// coupon (config.offers) skips the typing entirely — it's shown as a badge
// right on the shoot card and applied the moment that service is picked,
// but it's still just a coupon under the hood, so the same two re-checks
// cover it too.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  addDaysStr, formatLocalDateLong, formatLocalTime, zonedDateStr,
} from "@/lib/availability";
import { calculatePrice, formatDuration, formatINR, roundToRupee, type Quote } from "@/lib/pricing";
import type { BookingConfig, LocationOption, Service, ServiceDuration } from "@/lib/types";
import { buildBookingWhatsAppMessage, whatsappLink } from "@/lib/whatsapp";
import PaymentActions from "./PaymentActions";

type Step = "shoot" | "duration" | "date" | "location" | "details" | "review";
const STEPS: Step[] = ["shoot", "duration", "date", "location", "details", "review"];

type DaySummary = { date: string; closed: boolean; hasSlots: boolean; slotCount: number };
type Slot = { start: string; end: string };

type Details = { name: string; instagram: string; whatsapp: string; email: string; purpose: string; referenceLink: string };

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function ymd(y: number, m: number, d: number) {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function Pill({ active, disabled, onClick, children, className = "" }: {
  active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "border-safelight bg-safelight/15 text-safelight" : "border-line text-paper hover:border-muted"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Wizard({ initialConfig, razorpayConfigured }: { initialConfig: BookingConfig; razorpayConfigured: boolean }) {
  const config = initialConfig;
  const { settings } = config;

  const [step, setStep] = useState<Step>("shoot");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [durationId, setDurationId] = useState<string | null>(null);
  const [locSetting, setLocSetting] = useState<"indoor" | "outdoor" | null>(null);
  const [locationOptionId, setLocationOptionId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [dateStr, setDateStr] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [details, setDetails] = useState<Details>({ name: "", instagram: "", whatsapp: "", email: "", purpose: "", referenceLink: "" });
  const [terms, setTerms] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }
  // A brief pause so the tapped option's highlight is visible before the screen slides — feels chosen, not skipped.
  function advanceTo(next: Step) {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => setStep(next), 180);
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [slotsForDay, setSlotsForDay] = useState<Slot[] | null>(null);
  const [slotsReason, setSlotsReason] = useState<string | null>(null);
  const [reviewQuote, setReviewQuote] = useState<Quote | null>(null);

  const service = config.services.find((s) => s.id === serviceId) ?? null;
  const duration = config.durations.find((d) => d.id === durationId) ?? null;
  const durationsForService = config.durations.filter((d) => d.service_id === serviceId);
  const locationOption = config.locationOptions.find((l) => l.id === locationOptionId) ?? null;
  const zone = config.zones.find((z) => z.id === zoneId) ?? null;
  const optionsForSetting = config.locationOptions.filter((l) => l.setting === locSetting);
  const offersByService = useMemo(() => new Map(config.offers.map((o) => [o.service_id, o])), [config.offers]);

  const quote = useMemo(
    () => calculatePrice(config, {
      serviceId, durationId, locationOptionId, zoneId: locationOption?.uses_zone ? zoneId : null,
      couponCode: appliedCoupon?.code ?? null, couponDiscountPercent: appliedCoupon?.discountPercent ?? null,
    }),
    [config, serviceId, durationId, locationOptionId, zoneId, locationOption, appliedCoupon],
  );

  // A coupon was checked against one specific service — picking a different
  // one invalidates it, so don't carry a stale discount into a new selection.
  // If the newly picked service has an auto-apply offer, it takes over here
  // with no typing needed — the same badge the customer just saw on its card.
  useEffect(() => {
    const offer = serviceId ? offersByService.get(serviceId) : undefined;
    setAppliedCoupon(offer ? { code: offer.code, discountPercent: offer.discount_percent } : null);
    setCouponError(null);
    setCouponInput("");
  }, [serviceId, offersByService]);

  async function applyCoupon() {
    if (!serviceId || !couponInput.trim()) return;
    setCouponChecking(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput, serviceId }),
      });
      const data = await res.json();
      if (data.ok) { setAppliedCoupon({ code: data.code, discountPercent: data.discountPercent }); setCouponError(null); }
      else { setAppliedCoupon(null); setCouponError(data.error ?? "That coupon code isn't valid."); }
    } catch {
      setCouponError("Something went wrong. Try again.");
    }
    setCouponChecking(false);
  }
  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  }

  // Calendar: the month currently in view, independent of the selected date.
  const today = useMemo(() => zonedDateStr(new Date(), settings.timezone), [settings.timezone]);
  const maxBookableDate = useMemo(
    () => addDaysStr(today, Math.max(0, settings.max_days_ahead - 1)),
    [today, settings.max_days_ahead],
  );
  const todayMonthStartISO = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return ymd(y, m - 1, 1);
  }, [today]);
  const [viewYear, setViewYear] = useState(() => Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(today.slice(5, 7)) - 1);

  const monthStartISO = ymd(viewYear, viewMonth, 1);
  const monthLastISO = ymd(viewYear, viewMonth + 1, 0);
  const canGoPrevMonth = monthStartISO > todayMonthStartISO;
  const canGoNextMonth = ymd(viewYear, viewMonth + 1, 1) <= maxBookableDate;

  function goPrevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); }
    else setViewMonth(viewMonth - 1);
  }
  function goNextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); }
    else setViewMonth(viewMonth + 1);
  }

  const monthCells = useMemo(() => {
    const startWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - startWeekday + 1;
      return { day: dayNum, inMonth: dayNum >= 1 && dayNum <= daysInMonth, iso: ymd(viewYear, viewMonth, dayNum) };
    });
  }, [viewYear, viewMonth]);

  // Calendar: fetch availability for whichever month is in view, clamped to the bookable window.
  useEffect(() => {
    if (!durationId) return;
    const from = monthStartISO < today ? today : monthStartISO;
    const to = monthLastISO > maxBookableDate ? maxBookableDate : monthLastISO;
    if (from > to) { setDays([]); return; }
    setDays(null);
    fetch(`/api/availability/days?from=${from}&to=${to}&durationMinutes=${duration?.minutes ?? 60}`)
      .then((r) => r.json()).then((data) => setDays(data.days ?? [])).catch(() => setDays([]));
  }, [durationId, duration?.minutes, monthStartISO, monthLastISO, today, maxBookableDate]);

  // Slots for the selected day.
  useEffect(() => {
    if (!dateStr || !duration) return;
    setSlotsForDay(null); setSlotsReason(null); setSlot(null);
    fetch(`/api/availability?date=${dateStr}&durationMinutes=${duration.minutes}`)
      .then((r) => r.json())
      .then((data) => { setSlotsForDay(data.slots ?? []); setSlotsReason(data.reason ?? null); })
      .catch(() => setSlotsForDay([]));
  }, [dateStr, duration]);

  // Authoritative price check when reaching Review — also re-validates
  // whichever coupon is currently applied, in case it expired in the meantime.
  useEffect(() => {
    if (step !== "review") return;
    fetch("/api/quote", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId, durationId, locationOptionId, zoneId: locationOption?.uses_zone ? zoneId : null,
        couponCode: appliedCoupon?.code ?? null,
      }),
    }).then((r) => r.json()).then((data) => {
      setReviewQuote(data);
      if (appliedCoupon && data.couponError) {
        setAppliedCoupon(null);
        setCouponError(data.couponError);
      }
    }).catch(() => setReviewQuote(null));
  }, [step, serviceId, durationId, locationOptionId, zoneId, locationOption, appliedCoupon]);

  const idx = STEPS.indexOf(step);
  const goBack = () => setStep(STEPS[Math.max(idx - 1, 0)]);

  const locationSummary = locationOption
    ? `${locSetting === "outdoor" ? "Outdoor" : "Indoor"} · ${locationOption.label}${locationOption.uses_zone && zone ? `, ${zone.name}` : ""}${address ? ` (${address})` : ""}`
    : "";

  const finalQuote = reviewQuote ?? quote;

  const message = slot && service && duration && dateStr
    ? buildBookingWhatsAppMessage({
        serviceName: service.name, durationLabel: formatDuration(duration.minutes), dateStr,
        startISO: slot.start, endISO: slot.end, timezone: settings.timezone, locationSummary,
        totalPaise: finalQuote.total_paise, advancePaise: finalQuote.advance_paise, balancePaise: finalQuote.balance_paise,
        customerName: details.name, customerInstagram: details.instagram || undefined, purpose: details.purpose || undefined,
      })
    : "";
  const waLink = settings.whatsapp_number ? whatsappLink(settings.whatsapp_number, message) : null;

  const buildHoldPayload = () => ({
    serviceId, durationId, locationOptionId, zoneId: locationOption?.uses_zone ? zoneId : null,
    date: dateStr, slotStart: slot?.start, slotEnd: slot?.end, address: address || null,
    couponCode: appliedCoupon?.code ?? null,
    customer: {
      fullName: details.name, instagram: details.instagram || null, whatsapp: details.whatsapp,
      email: details.email, purpose: details.purpose || null, referenceLink: details.referenceLink || null,
    },
    termsAccepted: true,
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col sm:max-w-lg">
      <header className="flex flex-col gap-3 border-b border-line px-5 py-4">
        <div className="flex min-h-11 items-center gap-3">
          <button
            aria-label="Back" onClick={() => (idx === 0 ? window.history.back() : goBack())}
            className="-ml-3 flex size-11 items-center justify-center text-paper"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="flex-1 font-display text-lg tracking-wide">{settings.brand_name}</span>
          <span className="text-sm text-muted">Step {idx + 1} of {STEPS.length}</span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {STEPS.map((s, i) => <div key={s} className={`h-[3px] rounded-full ${i <= idx ? "bg-safelight" : "bg-line"}`} />)}
        </div>
      </header>

      <div key={step} className="step-enter flex-1 overflow-y-auto px-5 py-6">
        {step === "shoot" && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-3xl leading-tight">What are we shooting?</h1>
            {config.services.length === 0 && <p className="text-sm text-muted">Nothing's bookable right now — check back soon.</p>}
            <div className="flex flex-col gap-3">
              {config.services.map((s: Service) => {
                const cheapest = config.durations.filter((d) => d.service_id === s.id).sort((a, b) => a.price_paise - b.price_paise)[0];
                const offer = offersByService.get(s.id);
                const discounted = cheapest && offer ? roundToRupee(cheapest.price_paise * (1 - offer.discount_percent / 100)) : null;
                const pct = offer && Number.isInteger(offer.discount_percent) ? offer.discount_percent : offer?.discount_percent.toFixed(1);
                return (
                  <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setDurationId(null); advanceTo("duration"); }}
                    className={`rounded-2xl border p-5 text-left transition-colors ${serviceId === s.id ? "border-safelight bg-safelight/10" : "border-line hover:border-muted"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-lg font-semibold">{s.name}</div>
                      {offer && (
                        <span className="shrink-0 rounded-full bg-gradient-to-br from-[#f2c374] to-safelight px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-ground shadow-[0_2px_10px_-2px_rgba(227,161,59,0.6)]">
                          {pct}% off
                        </span>
                      )}
                    </div>
                    {s.description && <div className="mt-1 text-sm text-muted">{s.description}</div>}
                    {cheapest && (
                      <div className="mt-2 flex items-baseline gap-2 text-sm">
                        {discounted != null ? (
                          <>
                            <span className="text-muted line-through">{formatINR(cheapest.price_paise)}</span>
                            <span className="font-semibold text-safelight">from {formatINR(discounted)}</span>
                          </>
                        ) : (
                          <span className="text-safelight">from {formatINR(cheapest.price_paise)}</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "duration" && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-3xl leading-tight">How long?</h1>
            <div className="flex flex-col gap-2.5">
              {durationsForService.map((d: ServiceDuration) => (
                <button key={d.id} type="button" onClick={() => { setDurationId(d.id); advanceTo("date"); }}
                  className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-base ${durationId === d.id ? "border-safelight bg-safelight/10" : "border-line hover:border-muted"}`}>
                  <span className="font-semibold">{formatDuration(d.minutes)}</span>
                  <span>{formatINR(d.price_paise)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "date" && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-3xl leading-tight">Pick a date</h1>

            <div className="rounded-2xl border border-line/60 bg-surface/60 p-4 shadow-lg shadow-black/20 backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-muted">SELECT DATE</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button" aria-label="Previous month" disabled={!canGoPrevMonth} onClick={goPrevMonth}
                    className="text-muted transition-colors hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <span className="font-display text-sm">{MONTH_LABELS[viewMonth]} {viewYear}</span>
                  <button
                    type="button" aria-label="Next month" disabled={!canGoNextMonth} onClick={goNextMonth}
                    className="text-safelight transition-colors hover:text-paper disabled:cursor-not-allowed disabled:text-muted disabled:opacity-30"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              </div>

              <div className="mb-1.5 grid grid-cols-7">
                {WEEKDAY_LABELS.map((d, i) => (
                  <div key={i} className="text-center text-[10px] font-semibold tracking-wide text-muted">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-y-1.5">
                {monthCells.map((c, i) => {
                  const dayInfo = c.inMonth ? days?.find((d) => d.date === c.iso) ?? null : null;
                  const isPast = c.iso < today;
                  const beyondWindow = c.iso > maxBookableDate;
                  const loading = c.inMonth && days === null && !isPast && !beyondWindow;
                  const disabled = !c.inMonth || isPast || beyondWindow || loading || !dayInfo || dayInfo.closed || !dayInfo.hasSlots;
                  const selected = c.inMonth && dateStr === c.iso;
                  return (
                    <button
                      key={i} type="button" disabled={disabled}
                      onClick={() => setDateStr(c.iso)}
                      className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? "bg-safelight font-semibold text-ground"
                          : !c.inMonth
                          ? "text-muted/30"
                          : disabled
                          ? "text-muted/50"
                          : "text-paper hover:bg-raise"
                      }`}
                    >
                      {c.day}
                    </button>
                  );
                })}
              </div>
            </div>

            {dateStr && (
              <div className="flex flex-col gap-3">
                <div className="text-sm font-semibold">{formatLocalDateLong(dateStr, settings.timezone)} · {duration && formatDuration(duration.minutes)}</div>
                {slotsForDay === null ? (
                  <p className="text-sm text-muted">Loading times…</p>
                ) : slotsForDay.length === 0 ? (
                  <p className="text-sm text-muted">
                    {slotsReason === "paused" ? "Not taking bookings right now." : `No slot long enough is free on this day — try another date.`}
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slotsForDay.map((s) => (
                      <Pill key={s.start} active={slot?.start === s.start} onClick={() => { setSlot(s); advanceTo("location"); }} className="min-h-12">
                        {formatLocalTime(s.start, settings.timezone)}
                      </Pill>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted">Only times where the whole shoot fits are shown.</p>
              </div>
            )}
          </div>
        )}

        {step === "location" && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-3xl leading-tight">Where&rsquo;s the shoot?</h1>
            <div className="grid grid-cols-2 gap-2">
              {(["outdoor", "indoor"] as const).map((setting) => (
                <Pill key={setting} active={locSetting === setting} className="min-h-12 font-semibold"
                  onClick={() => { setLocSetting(setting); setLocationOptionId(null); setZoneId(null); }}>
                  {setting === "outdoor" ? "Outdoor" : "Indoor"}
                </Pill>
              ))}
            </div>

            {locSetting && (
              <div className="flex flex-col gap-2">
                {optionsForSetting.length > 1 && <div className="text-sm text-muted">Where exactly?</div>}
                {optionsForSetting.map((l: LocationOption) => (
                  <button key={l.id} type="button" onClick={() => { setLocationOptionId(l.id); setZoneId(null); if (!l.uses_zone) advanceTo("details"); }}
                    className={`min-h-13 rounded-xl border px-4 py-3 text-left text-sm ${locationOptionId === l.id ? "border-safelight bg-safelight/10" : "border-line"}`}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}

            {locationOption?.note && (
              <p className="rounded-lg bg-safelight/10 px-3.5 py-3 text-sm leading-relaxed text-safelight">{locationOption.note}</p>
            )}

            {locationOption?.uses_zone && (
              <div className="flex flex-col gap-2">
                <div className="text-sm text-muted">Which area?</div>
                {config.zones.map((z) => (
                  <button key={z.id} type="button" onClick={() => { setZoneId(z.id); if (!z.requires_quote) advanceTo("details"); }}
                    className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left ${zoneId === z.id ? "border-safelight bg-safelight/10" : "border-line"}`}>
                    <span className="flex flex-col">
                      <span className="text-sm">{z.name}</span>
                      {z.description && <span className="text-xs text-muted">{z.description}</span>}
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {z.requires_quote ? "Quote" : z.charge_paise > 0 ? `+ ${formatINR(z.charge_paise)}` : "Included"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {quote.requires_quote && (
              <div className="flex flex-col gap-3 rounded-xl border border-safelight p-4">
                <p className="text-sm leading-relaxed">This area needs a custom quote for travel before it can be booked online.</p>
                {settings.whatsapp_number && (
                  <a href={whatsappLink(settings.whatsapp_number, `Hi! I'd like a quote for a ${service?.name ?? "shoot"} in ${zone?.name ?? "my area"}.`)}
                    target="_blank" rel="noopener noreferrer"
                    className="btn btn-primary text-center">Message me for a quote</a>
                )}
              </div>
            )}

            {locationOption && !quote.requires_quote && (
              <Field label={locationOption.uses_zone ? "Location or Google Maps link (optional)" : "Location details (optional)"}>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder="e.g. Kumartuli ghat" />
              </Field>
            )}
          </div>
        )}

        {step === "details" && (
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-3xl leading-tight">About you</h1>
            <Field label="Full name"><input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} autoComplete="name" className="input" /></Field>
            <Field label="Instagram"><input value={details.instagram} onChange={(e) => setDetails({ ...details, instagram: e.target.value })} placeholder="@yourhandle" className="input" /></Field>
            <Field label="WhatsApp number"><input value={details.whatsapp} onChange={(e) => setDetails({ ...details, whatsapp: e.target.value })} inputMode="tel" placeholder="+91" className="input" /></Field>
            <Field label="Email"><input type="email" value={details.email} onChange={(e) => setDetails({ ...details, email: e.target.value })} autoComplete="email" className="input" /></Field>
            <Field label="Tell me briefly what you want to shoot">
              <textarea value={details.purpose} onChange={(e) => setDetails({ ...details, purpose: e.target.value })} rows={3} className="input" />
            </Field>
            <Field label="Reference link (optional)"><input value={details.referenceLink} onChange={(e) => setDetails({ ...details, referenceLink: e.target.value })} placeholder="Instagram post, Pinterest…" className="input" /></Field>
          </div>
        )}

        {step === "review" && slot && service && duration && dateStr && (
          <div className="flex flex-col gap-5">
            <p className="rounded-lg bg-safelight/10 px-3.5 py-3 text-sm leading-relaxed text-safelight">
              {razorpayConfigured
                ? "Your slot is held for a few minutes once you start paying — plenty of time to complete checkout."
                : "This time isn't reserved yet — message me now to lock it in before someone else picks it."}
            </p>
            <h1 className="font-display text-3xl leading-tight">Review and send</h1>
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-semibold">{service.name} · {formatDuration(duration.minutes)}</div>
              <div className="text-muted">{formatLocalDateLong(dateStr, settings.timezone)}, {formatLocalTime(slot.start, settings.timezone)} – {formatLocalTime(slot.end, settings.timezone)}</div>
              <div className="text-muted">{locationSummary}</div>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4">
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ok">Coupon <b>{appliedCoupon.code}</b> applied &mdash; {appliedCoupon.discountPercent}% off</span>
                  <button type="button" onClick={removeCoupon} className="shrink-0 text-xs text-muted underline underline-offset-2">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={couponInput} onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="Coupon code" className="input flex-1"
                  />
                  <button
                    type="button" onClick={applyCoupon} disabled={couponChecking || !couponInput.trim()}
                    className="btn btn-quiet shrink-0 disabled:pointer-events-none disabled:opacity-40"
                  >
                    {couponChecking ? "Checking…" : "Apply"}
                  </button>
                </div>
              )}
              {couponError && <p className="mt-2 text-xs text-danger">{couponError}</p>}
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5 text-sm">
              {finalQuote.lines.map((l, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className={l.kind === "discount" ? "text-ok" : "text-muted"}>{l.label}</span>
                  <span className={l.kind === "discount" ? "text-ok" : ""}>
                    {l.amount_paise < 0 ? `-${formatINR(-l.amount_paise)}` : formatINR(l.amount_paise)}
                  </span>
                </div>
              ))}
              <div className="h-px bg-line" />
              <div className="flex items-baseline justify-between"><span>Total</span><span className="font-display text-2xl">{formatINR(finalQuote.total_paise)}</span></div>
              <div className="flex justify-between"><span>Advance ({finalQuote.advance_percent}%)</span><span className="text-safelight">{formatINR(finalQuote.advance_paise)}</span></div>
              <div className="flex justify-between text-muted"><span>After the shoot</span><span>{formatINR(finalQuote.balance_paise)}</span></div>
            </div>

            {finalQuote.notes.map((n, i) => <p key={i} className="text-sm text-muted">{n.text}</p>)}

            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-safelight" />
              <span>
                I understand the advance confirms my date, and I accept the{" "}
                <Link href="/legal/cancellation" target="_blank" className="underline underline-offset-2">cancellation policy</Link> and{" "}
                <Link href="/legal/terms" target="_blank" className="underline underline-offset-2">terms</Link>.
              </span>
            </label>
          </div>
        )}
      </div>

      {toast && (
        <div className="toast-in pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-5">
          <div className="pointer-events-auto rounded-full border border-danger/40 bg-ground px-4 py-2 text-sm text-danger shadow-lg">{toast}</div>
        </div>
      )}

      {step === "details" ? (
        <footer className="border-t border-line px-5 py-4">
          <button
            onClick={() => {
              if (details.name.trim().length <= 1) return showToast("Enter your name to continue.");
              if (!/\d{10,}/.test(details.whatsapp.replace(/\D/g, ""))) return showToast("Enter a valid WhatsApp number to continue.");
              setStep("review");
            }}
            className="btn btn-primary block w-full text-center"
          >
            Continue
          </button>
        </footer>
      ) : step === "review" ? (
        <footer className="border-t border-line px-5 py-4">
          <PaymentActions
            razorpayConfigured={razorpayConfigured}
            terms={terms}
            waLink={waLink}
            buildHoldPayload={buildHoldPayload}
            brandName={settings.brand_name}
            contactEmail={details.email || undefined}
          />
        </footer>
      ) : (
        duration && idx >= 1 && (
          <footer className="border-t border-line px-5 py-4">
            <span className="text-xs text-muted">Total {formatINR(quote.total_paise)}</span>{" "}
            <span className="text-base font-semibold">· Advance <span className="text-safelight">{formatINR(quote.advance_paise)}</span></span>
          </footer>
        )
      )}
    </div>
  );
}
