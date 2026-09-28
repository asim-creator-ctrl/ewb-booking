import Link from "next/link";
import { loadBookingConfig } from "@/lib/config";

// Placeholder for Phase 2 (the real store: product grid, checkout, secure
// downloads). Exists now so the "Digital Products" card on the homepage
// has somewhere to land instead of 404ing.
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const config = await loadBookingConfig();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <span className="font-display text-2xl tracking-wide">{config.settings.brand_name}</span>
      <p className="max-w-xs text-sm text-muted">Digital products — presets and more — are coming soon.</p>
      <Link href="/" className="text-sm text-safelight underline underline-offset-4">&larr; Back</Link>
    </main>
  );
}
