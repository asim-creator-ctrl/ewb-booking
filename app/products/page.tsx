import Link from "next/link";
import { loadBookingConfig } from "@/lib/config";
import { loadProducts } from "@/lib/products";
import { formatINR } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [config, products] = await Promise.all([loadBookingConfig(), loadProducts()]);
  const { settings } = config;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8 sm:max-w-lg">
      <Link href="/" className="text-sm text-muted hover:text-paper">&larr; {settings.brand_name}</Link>

      <div className="mt-5">
        <h1 className="font-display text-3xl leading-tight">Digital Products</h1>
        <p className="mt-1.5 text-sm text-muted">
          Lightroom presets, shot and graded on my own frames &mdash; instant download after payment.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Nothing here yet &mdash; check back soon.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-3.5 pb-10">
          {products.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.slug}`}
              className={`overflow-hidden rounded-2xl border bg-surface/60 shadow-lg shadow-black/20 backdrop-blur-xl transition-colors hover:border-safelight/60 ${
                p.featured ? "border-safelight/55" : "border-line/60"
              }`}
            >
              <div className="relative h-36 bg-gradient-to-br from-raise to-surface">
                {p.featured && (
                  <span className="absolute left-3 top-3 rounded-full bg-safelight px-2.5 py-1 text-[10px] font-bold tracking-wide text-ground">
                    BEST VALUE
                  </span>
                )}
                {p.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnail_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[11px] tracking-wide text-muted">
                    [ Preset pack preview ]
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 px-4 py-3.5">
                <div>
                  <div className="font-display text-[17px] leading-tight">{p.name}</div>
                  {p.short_description && (
                    <div className="mt-0.5 text-[12.5px] text-muted">{p.short_description}</div>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-lg text-safelight">{formatINR(p.price_paise)}</span>
                    {p.compare_at_price_paise && (
                      <span className="text-[11.5px] text-muted/70 line-through">
                        {formatINR(p.compare_at_price_paise)}
                      </span>
                    )}
                  </span>
                  <span className="rounded-full bg-safelight px-4 py-2 text-[13px] font-bold text-ground">
                    Buy now
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
