// Placeholder until the booking landing page (Phase 3 / Phase 7).
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6">
      <h1 className="font-display text-5xl leading-[1.05]">Let&rsquo;s create something worth remembering.</h1>
      <p className="text-muted">Booking opens soon.</p>
      <Link href="/admin" className="text-sm text-muted underline underline-offset-4">Admin</Link>
    </main>
  );
}
