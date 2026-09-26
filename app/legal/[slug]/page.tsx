import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const SLUGS: Record<string, { type: string; label: string }> = {
  cancellation: { type: "cancellation", label: "Cancellation policy" },
  rescheduling: { type: "rescheduling", label: "Rescheduling policy" },
  terms: { type: "terms", label: "Terms" },
  privacy: { type: "privacy", label: "Privacy policy" },
  refund: { type: "refund", label: "Refund policy" },
};

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = SLUGS[slug];
  if (!entry) notFound();

  const db = createServiceClient();
  const [{ data: policy }, { data: settings }] = await Promise.all([
    db.from("policies").select("title, body, version").eq("type", entry.type).eq("active", true).maybeSingle(),
    db.from("settings").select("brand_name").eq("id", 1).single(),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-10">
      <Link href="/" className="text-sm text-muted hover:text-paper">&larr; {settings?.brand_name ?? "Home"}</Link>
      <h1 className="font-display text-3xl">{policy?.title ?? entry.label}</h1>
      {policy ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{policy.body}</p>
      ) : (
        <p className="text-sm text-muted">This policy hasn&rsquo;t been published yet — check back soon.</p>
      )}
    </main>
  );
}
