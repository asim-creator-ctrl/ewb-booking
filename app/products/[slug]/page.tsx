import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBookingConfig } from "@/lib/config";
import { getProductBySlug } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product ? `${product.name} · EDITORWALABHAIYA` : "Digital Products · EDITORWALABHAIYA" };
}

// Checkout (Razorpay + instant secure download) is Phase 3. Until it ships,
// "Buy now" opens a pre-filled WhatsApp message so there's a working way to
// sell today instead of a dead button.
export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, config] = await Promise.all([getProductBySlug(slug), loadBookingConfig()]);
  if (!product) notFound();

  const { settings } = config;
  const buyMessage = `Hi! I'd like to buy "${product.name}" (${formatINR(product.price_paise)}) from your Digital Products.`;
  const buyHref = settings.whatsapp_number
    ? whatsappLink(settings.whatsapp_number, buyMessage)
    : settings.contact_email
      ? `mailto:${settings.contact_email}?subject=${encodeURIComponent(`Buying: ${product.name}`)}`
      : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-6 sm:max-w-lg">
      <Link href="/products" className="text-sm text-muted hover:text-paper">&larr; Digital Products</Link>

      <div className="mt-4 flex-1 pb-32">
        <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-raise to-surface">
          {product.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.thumbnail_url} alt={product.name} className="aspect-[4/3] w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-xs tracking-wide text-muted">
              [ Preset pack preview ]
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div>
            {product.badge && (
              <span className="inline-block rounded-full border border-line px-2.5 py-1 text-[10.5px] tracking-wide text-muted">
                {product.badge}
              </span>
            )}
            <h1 className="mt-2.5 font-display text-[25px] leading-tight">{product.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <span className="font-display text-xl text-safelight">{formatINR(product.price_paise)}</span>
              {product.compare_at_price_paise && (
                <span className="text-xs text-muted/70 line-through">{formatINR(product.compare_at_price_paise)}</span>
              )}
              <span className="text-xs text-muted">one-time &middot; instant download</span>
            </div>
          </div>

          {product.includes.length > 0 && (
            <>
              <div className="h-px bg-line" />
              <div>
                <div className="mb-2.5 text-xs font-bold tracking-wide text-muted">WHAT&apos;S INCLUDED</div>
                <div className="flex flex-col gap-2">
                  {product.includes.map((line, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
                        <path d="M5 13L10 18L19 7" stroke="#e3a13b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-[13.5px] text-paper/90">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {product.description && (
            <>
              <div className="h-px bg-line" />
              <div>
                <div className="mb-2 text-xs font-bold tracking-wide text-muted">ABOUT THIS PACK</div>
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-paper/85">{product.description}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-line bg-ground/90 px-5 pb-6 pt-3.5 backdrop-blur-lg sm:max-w-lg">
        {buyHref ? (
          <a
            href={buyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-[50px] w-full items-center justify-center rounded-full bg-safelight text-[15px] font-bold text-ground"
          >
            Buy now &mdash; {formatINR(product.price_paise)}
          </a>
        ) : (
          <div className="flex h-[50px] w-full items-center justify-center rounded-full bg-line text-[15px] font-bold text-muted">
            Buy now &mdash; {formatINR(product.price_paise)}
          </div>
        )}
        <p className="mt-2 text-center text-[11px] text-muted">
          {settings.whatsapp_number ? "Message us on WhatsApp to complete your purchase" : "Contact us to complete your purchase"}
          {" "}&middot; delivered by email
        </p>
      </div>
    </main>
  );
}
