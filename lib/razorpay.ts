// Talks to Razorpay's REST API directly (Basic Auth with key:secret) — no SDK
// dependency, just fetch. Server only: never import this from a client
// component. Signature verification lives in razorpay-verify.ts so it can be
// unit tested without pulling in "server-only" or hitting the network.
import "server-only";
import { verifyPaymentSignature as verifySig, verifyWebhookSignature as verifyWebhookSig } from "./razorpay-verify";

const BASE = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay keys are not configured");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export async function createRazorpayOrder(opts: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({ amount: opts.amountPaise, currency: "INR", receipt: opts.receipt, notes: opts.notes ?? {} }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description ?? "Could not create the payment order.");
  return data;
}

export async function createRazorpayRefund(paymentId: string, amountPaise?: number) {
  const res = await fetch(`${BASE}/payments/${paymentId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(amountPaise ? { amount: amountPaise } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description ?? "Could not create the refund.");
  return data;
}

export async function createRazorpayPaymentLink(opts: {
  amountPaise: number;
  description: string;
  referenceId: string;
  customerName: string;
  customerEmail: string;
  customerContact: string;
}): Promise<{ id: string; short_url: string }> {
  const res = await fetch(`${BASE}/payment_links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      amount: opts.amountPaise, currency: "INR", description: opts.description, reference_id: opts.referenceId,
      customer: { name: opts.customerName, email: opts.customerEmail, contact: opts.customerContact },
      notify: { sms: false, email: false }, reminder_enable: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.description ?? "Could not create the payment link.");
  return data;
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  return verifySig(orderId, paymentId, signature, secret);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  return verifyWebhookSig(rawBody, signature, secret);
}
