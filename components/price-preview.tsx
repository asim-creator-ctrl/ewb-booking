"use client";

// Admin-side preview of the customer's price summary, driven by the same
// calculatePrice() the server uses. What you see here is what customers get.
import { useMemo, useState } from "react";
import { calculatePrice, formatDuration, formatINR } from "@/lib/pricing";
import type { BookingConfig } from "@/lib/types";

export function PricePreview({ config }: { config: BookingConfig }) {
  const [serviceId, setService] = useState(config.services[0]?.id ?? "");
  const durations = config.durations.filter((d) => d.service_id === serviceId);
  const [durationId, setDuration] = useState(durations[0]?.id ?? "");
  const [locationOptionId, setLocation] = useState(config.locationOptions[0]?.id ?? "");
  const [zoneId, setZone] = useState(config.zones[0]?.id ?? "");

  const location = config.locationOptions.find((l) => l.id === locationOptionId);
  const q = useMemo(
    () => calculatePrice(config, { serviceId, durationId, locationOptionId, zoneId: location?.uses_zone ? zoneId : null }),
    [config, serviceId, durationId, locationOptionId, zoneId, location],
  );

  if (!config.services.length) return <p className="text-muted">No shoot types are switched on.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Shoot</span>
          <select className="input" value={serviceId} onChange={(e) => {
            setService(e.target.value);
            setDuration(config.durations.find((d) => d.service_id === e.target.value)?.id ?? "");
          }}>
            {config.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Duration</span>
          <select className="input" value={durationId} onChange={(e) => setDuration(e.target.value)}>
            {durations.map((d) => <option key={d.id} value={d.id}>{formatDuration(d.minutes)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-muted">Location</span>
          <select className="input" value={locationOptionId} onChange={(e) => setLocation(e.target.value)}>
            {config.locationOptions.map((l) => (
              <option key={l.id} value={l.id}>{l.setting === "outdoor" ? "Outdoor" : "Indoor"} · {l.label}</option>
            ))}
          </select>
        </label>
        {location?.uses_zone && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Area</span>
            <select className="input" value={zoneId} onChange={(e) => setZone(e.target.value)}>
              {config.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5" aria-live="polite">
        <dl className="flex flex-col gap-2 text-sm">
          {q.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-4">
              <dt className="text-muted">{l.label}</dt><dd>{formatINR(l.amount_paise)}</dd>
            </div>
          ))}
        </dl>
        <div className="my-4 border-t border-line" />
        {q.requires_quote ? (
          <p className="text-safelight">Needs a custom quote. Customers will be asked to message you.</p>
        ) : (
          <dl className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted">Total</dt>
              <dd className="font-display text-3xl">{formatINR(q.total_paise)}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt>Advance now ({q.advance_percent}%)</dt><dd className="text-safelight">{formatINR(q.advance_paise)}</dd>
            </div>
            <div className="flex justify-between text-sm text-muted">
              <dt>Balance after shoot</dt><dd>{formatINR(q.balance_paise)}</dd>
            </div>
          </dl>
        )}
        {q.notes.map((n, i) => <p key={i} className="mt-3 text-xs text-muted">{n.text}</p>)}
        {q.errors.map((e, i) => <p key={i} className="mt-3 text-xs text-danger">{e}</p>)}
      </div>
    </div>
  );
}
