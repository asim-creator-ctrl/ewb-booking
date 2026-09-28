// The digital-products counterpart to bookings.ts's createBookingHold /
// confirmBookingByOrderId pair.
//
// createProductOrder: re-validates the product server-side, records a
// 'created' purchase, and opens a Razorpay order for its price.
//
// confirmPurchaseByOrderId: called from both the client's post-checkout
// verify call AND the Razorpay webhook, so — same as the booking flow — it's
// written to be safely idempotent, and it mints the one-time download token
// that the buyer is redirected to.
import "server-only";
import { z } from "zod";
import { createServiceClient } from "./supabase/service";
import { createRazorpayOrder } from "./razorpay";
import { onPurchaseConfirmed } from "./product-notifications";

type Db = ReturnType<typeof createServiceClient>;

const CheckoutInput = z.object({
  productId: z.string().uuid(),
  buyerEmail: z.string().trim().email().max(200),
  buyerName: z.string().trim().max(120).nullish(),
});

export type CheckoutResult =
  | { ok: true; purchaseId: string; razorpayOrderId: string; keyId: string; amountPaise: number }
  | { ok: false; error: string };

export async function createProductOrder(input: unknown): Promise<CheckoutResult> {
  const parsed = CheckoutInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  const d = parsed.data;

  const db = createServiceClient();
  const { data: product } = await db.from("products").select("id, name, price_paise, active").eq("id", d.productId).maybeSingle();
  if (!product || !product.active) return { ok: false, error: "This product isn't available right now." };
  if (!product.price_paise || product.price_paise <= 0) return { ok: false, error: "This product isn't priced yet — message us instead." };

  const { data: purchase, error: insertErr } = await db.from("purchases").insert({
    product_id: product.id, product_name: product.name, amount_paise: product.price_paise,
    buyer_email: d.buyerEmail.toLowerCase(), buyer_name: d.buyerName || null, status: "created",
  }).select("id").single();
  if (insertErr || !purchase) return { ok: false, error: "Could not start your order. Please try again." };

  try {
    const order = await createRazorpayOrder({
      amountPaise: product.price_paise, receipt: purchase.id,
      notes: { purchase_id: purchase.id, product_id: product.id },
    });
    await db.from("purchases").update({ gateway_order_id: order.id }).eq("id", purchase.id);
    return { ok: true, purchaseId: purchase.id, razorpayOrderId: order.id, keyId: process.env.RAZORPAY_KEY_ID!, amountPaise: product.price_paise };
  } catch {
    await db.from("purchases").update({ status: "failed" }).eq("id", purchase.id);
    return { ok: false, error: "Could not start payment. Please try again in a moment." };
  }
}

/** Live from settings on every call, same as the booking flow's hold_minutes — an admin change to the expiry or download-limit applies to the very next purchase. */
async function issueDownloadToken(db: Db, purchaseId: string): Promise<string> {
  const { data: settings } = await db.from("settings").select("download_expiry_minutes, download_max_downloads").eq("id", 1).single();
  const expiryMinutes = settings?.download_expiry_minutes ?? 45;
  const maxDownloads = settings?.download_max_downloads ?? 3;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60000).toISOString();
  const { data, error } = await db.from("download_tokens").insert({
    purchase_id: purchaseId, expires_at: expiresAt, max_downloads: maxDownloads,
  }).select("token").single();
  if (error || !data) throw new Error("Could not create a download link.");
  return data.token;
}

async function latestTokenFor(db: Db, purchaseId: string): Promise<string | null> {
  const { data } = await db.from("download_tokens").select("token").eq("purchase_id", purchaseId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.token ?? null;
}

export type ConfirmPurchaseResult =
  | { ok: true; purchaseId: string; token: string; alreadyConfirmed?: boolean }
  | { ok: false; purchaseId?: string; error: string };

/** Idempotent: safe to call more than once for the same order (client verify + webhook both call this). */
export async function confirmPurchaseByOrderId(
  db: Db,
  opts: { gatewayOrderId: string; gatewayPaymentId: string; method?: string },
): Promise<ConfirmPurchaseResult> {
  const { data: purchase } = await db.from("purchases").select("id, status").eq("gateway_order_id", opts.gatewayOrderId).maybeSingle();
  if (!purchase) return { ok: false, error: "Unknown purchase order." };

  if (purchase.status === "paid") {
    const token = await latestTokenFor(db, purchase.id);
    if (token) return { ok: true, purchaseId: purchase.id, token, alreadyConfirmed: true };
  }

  const { data: updated } = await db.from("purchases")
    .update({ status: "paid", gateway_payment_id: opts.gatewayPaymentId, paid_at: new Date().toISOString() })
    .eq("id", purchase.id).in("status", ["created", "failed"])
    .select("id").maybeSingle();

  if (!updated) {
    // Blocked by a concurrent call (client verify + webhook can race). Re-check
    // reality and reuse its token rather than minting a second one.
    const { data: fresh } = await db.from("purchases").select("id, status").eq("id", purchase.id).single();
    if (fresh?.status === "paid") {
      const token = await latestTokenFor(db, purchase.id);
      if (token) return { ok: true, purchaseId: purchase.id, token, alreadyConfirmed: true };
    }
    return { ok: false, purchaseId: purchase.id, error: "Could not confirm this payment." };
  }

  const token = await issueDownloadToken(db, purchase.id);
  await onPurchaseConfirmed(db, purchase.id, token);
  return { ok: true, purchaseId: purchase.id, token };
}

export type RedeemResult =
  | { ok: true; signedUrl: string }
  | { ok: false; error: string };

/** Validates a download link, mints a short-lived Supabase Storage signed URL for the deliverable, and counts the download against the token's limit. */
export async function redeemDownloadToken(token: string): Promise<RedeemResult> {
  const db = createServiceClient();
  const { data: row } = await db.from("download_tokens")
    .select("id, expires_at, max_downloads, downloads_used, purchases(product_id)")
    .eq("token", token).maybeSingle();
  if (!row) return { ok: false, error: "This download link isn't valid." };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "This download link has expired. Request a new one below." };
  }
  if (row.downloads_used >= row.max_downloads) {
    return { ok: false, error: "This link has already been used its allowed number of times. Request a new one below." };
  }

  const purchaseRow = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases;
  const productId = purchaseRow?.product_id as string | undefined;
  if (!productId) return { ok: false, error: "Could not find this order's file." };

  const { data: product } = await db.from("products").select("file_path").eq("id", productId).maybeSingle();
  if (!product?.file_path) return { ok: false, error: "This product's file isn't uploaded yet — message us and we'll sort it out." };

  const { data: signed, error: signErr } = await db.storage.from("product-files").createSignedUrl(product.file_path, 120);
  if (signErr || !signed) return { ok: false, error: "Could not prepare your download. Please try again." };

  await db.from("download_tokens").update({ downloads_used: row.downloads_used + 1 }).eq("id", row.id);
  return { ok: true, signedUrl: signed.signedUrl };
}

export type TokenInfo = {
  productName: string;
  amountPaise: number;
  buyerEmail: string;
  thumbnailUrl: string | null;
  expiresAt: string;
  maxDownloads: number;
  downloadsUsed: number;
};

/** Read-only order summary for the success page — never mints a signed URL or counts a download. */
export async function getTokenInfo(token: string): Promise<TokenInfo | null> {
  const db = createServiceClient();
  const { data } = await db.from("download_tokens")
    .select("expires_at, max_downloads, downloads_used, purchases(product_name, amount_paise, buyer_email, products(thumbnail_url))")
    .eq("token", token).maybeSingle();
  if (!data) return null;
  const purchase = Array.isArray(data.purchases) ? data.purchases[0] : data.purchases;
  if (!purchase) return null;
  const product = Array.isArray(purchase.products) ? purchase.products[0] : purchase.products;
  return {
    productName: purchase.product_name, amountPaise: purchase.amount_paise, buyerEmail: purchase.buyer_email,
    thumbnailUrl: product?.thumbnail_url ?? null,
    expiresAt: data.expires_at, maxDownloads: data.max_downloads, downloadsUsed: data.downloads_used,
  };
}

const ResendInput = z.object({ email: z.string().trim().email().max(200) });

/** A buyer who lost or didn't get the email can ask for a fresh link by email — mints a new token for their most recent paid order and re-sends the same purchase email. */
export async function resendDownloadLink(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const parsed = ResendInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email." };

  const db = createServiceClient();
  const { data: purchase } = await db.from("purchases")
    .select("id").eq("buyer_email", parsed.data.email.toLowerCase()).eq("status", "paid")
    .order("paid_at", { ascending: false }).limit(1).maybeSingle();
  if (!purchase) return { ok: false, error: "No paid order found for that email." };

  const token = await issueDownloadToken(db, purchase.id);
  await onPurchaseConfirmed(db, purchase.id, token, { resend: true });
  return { ok: true };
}
