// Fires after a digital-product purchase is confirmed (called from
// confirmPurchaseByOrderId, and again on a manual resend). Same
// never-let-a-notification-failure-touch-the-sale philosophy as
// notifications.ts: every send is independently wrapped.
import "server-only";
import { createServiceClient } from "./supabase/service";
import { sendTelegramMessage, isTelegramConfigured } from "./telegram";
import { sendEmail, isEmailConfigured } from "./email";
import { formatINR } from "./pricing";

type Db = ReturnType<typeof createServiceClient>;

function downloadUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/download/${token}`;
}

function successUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/products/success?token=${token}`;
}

export async function onPurchaseConfirmed(
  db: Db,
  purchaseId: string,
  token: string,
  opts: { resend?: boolean } = {},
): Promise<void> {
  try {
    const { data: settings } = await db.from("settings").select("brand_name, contact_email").eq("id", 1).single();
    const { data: purchase } = await db.from("purchases")
      .select("product_name, amount_paise, buyer_email, buyer_name").eq("id", purchaseId).single();
    if (!settings || !purchase) return;

    if (isEmailConfigured()) {
      const html = `
        <p>${opts.resend ? "Here's your download link again for" : "Thanks for your purchase —"} <b>${purchase.product_name}</b>.</p>
        <p><a href="${downloadUrl(token)}">Download your files</a></p>
        <p>Or view your order page: <a href="${successUrl(token)}">${successUrl(token)}</a></p>
        <p>This link expires after a while and only works for a limited number of downloads. If it stops working, open the order page above and tap Resend.</p>
      `;
      try {
        await sendEmail({
          to: purchase.buyer_email,
          subject: `${opts.resend ? "Your download link" : "Your download"} — ${purchase.product_name}`,
          html,
        });
      } catch (e) {
        console.error("Purchase email failed:", e);
      }
    }

    if (!opts.resend) {
      const adminLines = [
        "<b>Digital product sold</b>", purchase.product_name, formatINR(purchase.amount_paise),
        purchase.buyer_name ?? "", purchase.buyer_email,
      ].filter(Boolean).join("\n");

      if (isTelegramConfigured()) {
        try { await sendTelegramMessage(adminLines); } catch (e) { console.error("Telegram sale alert failed:", e); }
      }
      if (isEmailConfigured() && settings.contact_email) {
        try {
          await sendEmail({ to: settings.contact_email, subject: `Sold — ${purchase.product_name}`, html: adminLines.replace(/\n/g, "<br>") });
        } catch (e) {
          console.error("Admin sale email failed:", e);
        }
      }
    }
  } catch (e) {
    console.error("onPurchaseConfirmed failed:", e);
  }
}
