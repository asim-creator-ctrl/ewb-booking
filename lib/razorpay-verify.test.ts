import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "./razorpay-verify";

describe("verifyPaymentSignature", () => {
  const secret = "test_secret_123";

  it("accepts a correctly computed signature", () => {
    const sig = crypto.createHmac("sha256", secret).update("order_abc|pay_xyz").digest("hex");
    expect(verifyPaymentSignature("order_abc", "pay_xyz", sig, secret)).toBe(true);
  });

  it("rejects a signature for a different payment id (tampering)", () => {
    const sig = crypto.createHmac("sha256", secret).update("order_abc|pay_xyz").digest("hex");
    expect(verifyPaymentSignature("order_abc", "pay_DIFFERENT", sig, secret)).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const sig = crypto.createHmac("sha256", "wrong_secret").update("order_abc|pay_xyz").digest("hex");
    expect(verifyPaymentSignature("order_abc", "pay_xyz", sig, secret)).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    expect(verifyPaymentSignature("order_abc", "pay_xyz", "not-a-real-signature", secret)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "webhook_secret_456";

  it("accepts a correctly computed signature over the raw body", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
  });

  it("rejects if the body changes after signing (tamper detection)", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const tampered = JSON.stringify({ event: "payment.captured", amount: 999999999 });
    expect(verifyWebhookSignature(tampered, sig, secret)).toBe(false);
  });

  it("rejects an empty signature without throwing", () => {
    expect(verifyWebhookSignature("{}", "", secret)).toBe(false);
  });
});
