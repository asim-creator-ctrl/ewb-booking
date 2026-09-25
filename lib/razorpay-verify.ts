// Pure HMAC verification for Razorpay's two signature schemes. Kept free of
// `server-only` and of `process.env` reads so it can be unit tested directly;
// the server-only wrapper in razorpay.ts reads the actual secrets and calls in.

import crypto from "crypto";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** A Razorpay Checkout payment's signature: HMAC-SHA256("<order_id>|<payment_id>", key_secret). */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return timingSafeEqualStr(expected, signature);
}

/** A Razorpay webhook delivery's signature: HMAC-SHA256(<raw request body>, webhook_secret). */
export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return timingSafeEqualStr(expected, signature);
}
