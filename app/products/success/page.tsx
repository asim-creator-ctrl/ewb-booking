import Link from "next/link";
import { getTokenInfo } from "@/lib/downloads";
import { formatINR } from "@/lib/pricing";
import { loadBookingConfig } from "@/lib/config";
import { whatsappLink } from "@/lib/whatsapp";
import { resendDownloadLinkAction } from "./actions";

export const dynamic = "force-dynamic";

type Search = Promise<{ token?: string; dlError?: string; resendOk?: string; resendError?: string }>;

export default async function PurchaseSuccessPage({ searchParams }: { searchParams: Search }) {
  const { token, dlError, resendOk, resendError } = await searchParams;
  const [info, config] = await Promise.all([
    token ? getTokenInfo(token) : Promise.resolve(null),
    loadBookingConfig(),
  ]);
  const { settings } = config;
  const waHref = settings.whatsapp_number
    ? whatsappLink(settings.whatsapp_number, "Hi! I need help with a digital product download.")
    : null;

  const expiresInMinutes = info ? Math.max(0, Math.round((new Date(info.expiresAt).getTime() - Date.now()) / 60000)) : null;
  const downloadsLeft = info ? Math.max(0, info.maxDownloads - info.downloadsUsed) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 py-10 text-center sm:max-w-lg">
      <Link href="/products" className="self-start text-sm text-muted hover:text-paper">&larr; Digital Products</Link>

      {info ? (
        <>
          <div className="mt-8 flex size-16 items-center justify-center rounded-full border-2 border-safelight bg-safelight/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M5 13L10 18L19 7" stroke="#e3a13b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-4 font-display text-2xl">Purchase confirmed</h1>

          <div className="mt-6 flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-raise">
              {info.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.thumbnailUrl} alt={info.productName} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{info.productName}</div>
              <div className="text-xs text-muted">{formatINR(info.amountPaise)}</div>
            </div>
          </div>

          {dlError && (
            <p className="mt-4 w-full rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{dlError}</p>
          )}

          <a
            href={`/api/download/${token}`}
            className="mt-6 flex h-[50px] w-full items-center justify-center rounded-full bg-safelight text-[15px] font-bold text-ground"
          >
            Download presets
          </a>

          {expiresInMinutes !== null && downloadsLeft !== null && (
            <p className="mt-3 rounded-lg border border-dashed border-line px-4 py-2.5 text-[11.5px] text-muted">
              Link expires in {expiresInMinutes} minute{expiresInMinutes === 1 ? "" : "s"} &middot; up to {downloadsLeft} download{downloadsLeft === 1 ? "" : "s"} left
            </p>
          )}
        </>
      ) : (
        <>
          <h1 className="mt-12 font-display text-2xl">Get your download link</h1>
          <p className="mt-2 text-sm text-muted">
            {token ? "That link isn't valid or has expired." : "Enter the email you paid with and we'll send it to you."}
          </p>
        </>
      )}

      <div className="mt-8 w-full border-t border-line pt-6">
        <p className="text-xs font-bold tracking-wide text-muted">DIDN&apos;T GET THE EMAIL?</p>
        {resendOk && (
          <p className="mt-3 rounded-lg border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">Sent! Check your inbox (and spam folder).</p>
        )}
        {resendError && (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{resendError}</p>
        )}
        <form action={resendDownloadLinkAction} className="mt-3 flex gap-2">
          {token && <input type="hidden" name="token" value={token} />}
          <input type="email" name="email" required placeholder="you@email.com" defaultValue={info?.buyerEmail ?? ""} className="input flex-1" />
          <button className="btn btn-primary shrink-0">Resend</button>
        </form>
      </div>

      {waHref && (
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="mt-8 text-sm text-muted underline underline-offset-4 hover:text-paper">
          Need help? Message us on WhatsApp
        </a>
      )}
    </main>
  );
}
