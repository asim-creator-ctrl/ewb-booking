"use client";

// The product page's sticky "Buy now" bar. If Razorpay is configured, this
// takes an email (there's no earlier step that collects one, unlike the
// booking wizard), creates a purchase + Razorpay order, opens Checkout, and
// on success sends the buyer straight to their download. If Razorpay isn't
// configured yet, it falls back to the WhatsApp/email handoff — same
// graceful-fallback pattern as components/booking/PaymentActions.tsx.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/pricing";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void; on: (event: string, cb: (resp: unknown) => void) => void };
  }
}

type Phase = "idle" | "creating" | "checkout" | "verifying" | "failed";

export default function BuyButton({
  productId, amountPaise, razorpayConfigured, brandName, fallbackHref, fallbackLabel,
}: {
  productId: string;
  amountPaise: number;
  razorpayConfigured: boolean;
  brandName: string;
  fallbackHref?: string;
  fallbackLabel: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (!razorpayConfigured || scriptLoaded.current) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
    scriptLoaded.current = true;
  }, [razorpayConfigured]);

  function openCheckout(info: { razorpayOrderId: string; keyId: string; amountPaise: number }) {
    setPhase("checkout");
    const rzp = new window.Razorpay({
      key: info.keyId, order_id: info.razorpayOrderId, amount: info.amountPaise, currency: "INR",
      name: brandName, description: "Digital product purchase",
      prefill: { email },
      theme: { color: "#e3a13b" },
      handler: async (resp: unknown) => {
        const r = resp as { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
        setPhase("verifying");
        try {
          const vr = await fetch("/api/products/verify", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature }),
          });
          const vd = await vr.json();
          if (vd.ok) router.push(`/products/success?token=${vd.token}`);
          else { setError(vd.error ?? "Could not confirm your payment."); setPhase("failed"); }
        } catch {
          setError("Payment went through, but we couldn't confirm it automatically — message us and we'll sort it out.");
          setPhase("failed");
        }
      },
      modal: { ondismiss: () => setPhase("idle") },
    });
    rzp.on("payment.failed", () => { setError("Payment didn't go through. Please try again."); setPhase("failed"); });
    rzp.open();
  }

  async function startPayment() {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email — your download link goes there.");
      return;
    }
    setPhase("creating");
    try {
      const res = await fetch("/api/products/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, buyerEmail: email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error ?? "Could not start checkout."); setPhase("failed"); return; }
      openCheckout({ razorpayOrderId: data.razorpayOrderId, keyId: data.keyId, amountPaise: data.amountPaise });
    } catch {
      setError("Something went wrong. Check your connection and try again.");
      setPhase("failed");
    }
  }

  const busy = phase === "creating" || phase === "checkout" || phase === "verifying";

  if (!razorpayConfigured) {
    return fallbackHref ? (
      <a href={fallbackHref} target="_blank" rel="noopener noreferrer"
        className="flex h-[50px] w-full items-center justify-center rounded-full bg-safelight text-[15px] font-bold text-ground">
        {fallbackLabel}
      </a>
    ) : (
      <div className="flex h-[50px] w-full items-center justify-center rounded-full bg-line text-[15px] font-bold text-muted">
        {fallbackLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">{error}</p>}
      <input
        type="email" inputMode="email" placeholder="Your email — for the download link"
        value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
        className="input h-11 w-full text-sm"
      />
      <button
        onClick={startPayment} disabled={busy}
        className="flex h-[50px] w-full items-center justify-center rounded-full bg-safelight text-[15px] font-bold text-ground disabled:opacity-60"
      >
        {phase === "creating" ? "Starting checkout…" : phase === "verifying" ? "Confirming…" : `Buy now — ${formatINR(amountPaise)}`}
      </button>
      {fallbackHref && (
        <a href={fallbackHref} target="_blank" rel="noopener noreferrer" className="text-center text-xs text-muted underline underline-offset-4">
          or message us on WhatsApp instead
        </a>
      )}
    </div>
  );
}
