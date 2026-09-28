import Link from "next/link";
import type { ReactNode } from "react";
import { loadBookingConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

// One card per line to add a third — icon, label, description, href.
// Keeping this a plain data array (rather than JSX inline below) is what
// makes a future "Prints" or "Mentorship" card a one-line change.
type CardDef = { href: string; label: string; description: string; icon: ReactNode };

const CALENDAR_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </svg>
);

const BAG_ICON = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="7.5" width="17" height="13" rx="2.5" />
    <path d="M8 7.5V6a4 4 0 0 1 8 0v1.5" />
  </svg>
);

const CARDS: CardDef[] = [
  { href: "/book", label: "Booking", description: "Check availability & book a shoot", icon: CALENDAR_ICON },
  { href: "/products", label: "Digital Products", description: "Lightroom presets & more", icon: BAG_ICON },
];

export default async function Home() {
  const config = await loadBookingConfig();
  const { settings } = config;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-10 px-5 py-10 sm:max-w-lg">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="font-display text-2xl tracking-wide">{settings.brand_name}</span>
        <p className="max-w-xs text-sm text-muted">{settings.tagline || "Photographer & content creator."}</p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-5 transition-colors hover:border-safelight/60 hover:bg-raise"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-ground text-safelight">
              {card.icon}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-lg leading-tight">{card.label}</span>
              <span className="truncate text-sm text-muted">{card.description}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0 text-muted">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </div>

      <div className="flex flex-col items-center gap-1 text-xs text-muted">
        <span>@{settings.instagram_username}</span>
        {settings.contact_email && <span>{settings.contact_email}</span>}
      </div>
    </main>
  );
}
