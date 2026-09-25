import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "./actions";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/services", label: "Shoots & pricing" },
  { href: "/admin/locations", label: "Locations & areas" },
  { href: "/admin/inclusions", label: "Included & extras" },
  { href: "/admin/hours", label: "Working hours" },
  { href: "/admin/policies", label: "Policies" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-line md:sticky md:top-0 md:h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4 md:block md:py-6">
          <Link href="/admin" className="font-display text-xl tracking-wide">EDITORWALABHAIYA</Link>
          <p className="hidden text-xs text-muted md:mt-1 md:block">Booking admin</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href}
              className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-paper">
              {n.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="hidden px-5 md:absolute md:bottom-6 md:block">
          <p className="mb-2 truncate text-xs text-muted">{user.email}</p>
          <button className="text-sm text-muted underline underline-offset-4 hover:text-paper">Sign out</button>
        </form>
      </aside>
      <main className="px-5 py-8 md:px-10 md:py-12">{children}</main>
    </div>
  );
}
