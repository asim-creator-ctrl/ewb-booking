"use client";

// The Review step's submit action. If Razorpay is configured, this creates a
// real hold + Razorpay order, opens Checkout, and confirms the booking. If
// not (Asim hasn't added his keys yet), it falls back to the Phase 3
// WhatsApp handoff so the page never breaks either way.

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (resp: unknown) => void) => void };
  }
}

type Phase = "idle" | "creating" | "checkout" | "verifying" | "confirmed" | "conflict" | "failed";

type HoldInfo = { bookingId: string; orderId: string; keyId: string; amountPaise: number; holdExpiresAt: string };

export default function PaymentActions({
  razorpayConfigured, terms, waLink, buildHoldPayload, brandName, contactEmail,
}: {
  razorpayConfigured: boolean;
  terms: boolean;
  waLink: string | null;
  buildHoldPayload: () => Record<string, unknown>;
  brandName: string;
  contactEmail?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [holdInfo, setHoldInfo] = useState<HoldInfo | null>(null);
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (!razorpayConfigured || scriptLoaded.current) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
    scriptLoaded.current = true;
  }, [razorpayConfigured]);

  useEffect(() => {
    if (!holdInfo || phase === "confirmed") return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(holdInfo.holdExpiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdInfo, phase]);

  function openCheckout(info: { orderId: string; keyId: string; amountPaise: number }) {
    setPhase("checkout");
    const rzp = new window.Razorpay({
      key: info.keyId, order_id: info.orderId, amount: info.amountPaise, currency: "INR",
      name: brandName, description: "Booking advance",
      prefill: contactEmail ? { email: contactEmail } : undefined,
      theme: { color: "#e3a13b" },
      handler: async (resp: unknown) => {
        const r = resp as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
        setPhase("verifying");
        try {
          const vr = await fetch("/api/payments/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature }),
          });
          const vd = await vr.json();
          if (vd.ok) { setConfirmedRef(vd.ref ?? null); setPhase("confirmed"); }
          else if (vd.conflict) { setPhase("conflict"); setError(vd.error); }
          else { setError(vd.error ?? "Could not confirm your payment."); setPhase("failed"); }
        } catch {
          setError("Payment went through, but we couldn't confirm it automatically — message me and I'll sort it out.");
          setPhase("failed");
        }
      },
      modal: { ondismiss: () => setPhase("idle") },
    });
    rzp.on("payment.failed", () => { setError("Payment didn't go through. Your slot is still held — try again."); setPhase("failed"); });
    rzp.open();
  }

  async function startPayment() {
    setError(null); setPhase("creating");
    try {
      const res = await fetch("/api/bookings/hold", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildHoldPayload()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? "Could not reserve your slot."); setPhase("failed"); return; }
      setHoldInfo({ bookingId: data.bookingId, orderId: data.razorpayOrderId, keyId: data.keyId, amountPaise: data.amountPaise, holdExpiresAt: data.holdExpiresAt });
      openCheckout({ orderId: data.razorpayOrderId, keyId: data.keyId, amountPaise: data.amountPaise });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setPhase("failed");
    }
  }

  function retryCheckout() {
    if (!holdInfo || remaining <= 0) { setPhase("idle"); setHoldInfo(null); setError(null); return; }
    openCheckout(holdInfo);
  }

  if (phase === "confirmed") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-ok/40 bg-ok/10 p-4 text-sm">
        <p className="font-semibold text-ok">Booking confirmed{confirmedRef ? ` — ${confirmedRef}` : ""}.</p>
        <p className="text-muted">I&rsquo;ll reach out personally to plan the shoot. Screenshot this for your records.</p>
      </div>
    );
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const busy = phase === "creating" || phase === "checkout" || phase === "verifying";
  const canRetry = holdInfo && remaining > 0 && phase === "failed";

  return (
    <div className="flex flex-col gap-3">
      {holdInfo && remaining > 0 && phase !== "idle" && (
        <p className="text-center text-sm text-muted">Your slot is held for {mm}:{ss}</p>
      )}
      {phase === "conflict" && error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">{error} I&rsquo;ll follow up on WhatsApp.</p>
      )}
      {phase === "failed" && error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm text-danger">{error}</p>
      )}
      {razorpayConfigured && (
        <button
          onClick={canRetry ? retryCheckout : startPayment}
          disabled={!terms || busy}
          className="btn btn-primary block w-full text-center disabled:pointer-events-none disabled:opacity-40"
        >
          {phase === "creating" ? "Reserving your slot…" : phase === "verifying" ? "Confirming…" : canRetry ? "Try payment again" : "Pay advance"}
        </button>
      )}
      {waLink && (
        <a
          href={terms ? waLink : undefined} aria-disabled={!terms} target="_blank" rel="noopener noreferrer"
          className={
            razorpayConfigured
              ? `text-center text-sm text-muted underline underline-offset-4 ${!terms ? "pointer-events-none opacity-40" : ""}`
              : `btn btn-primary block w-full text-center ${!terms ? "pointer-events-none opacity-40" : ""}`
          }
        >
          {razorpayConfigured ? "or message me on WhatsApp instead" : "Message me to book"}
        </a>
      )}
    </div>
  );
}
