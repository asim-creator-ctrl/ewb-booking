// Small shared pieces for the admin screens. Server components; no client JS.
import type { ReactNode } from "react";

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 max-w-2xl">
      <h1 className="font-display text-4xl leading-tight">{title}</h1>
      {children && <p className="mt-2 text-muted">{children}</p>}
    </header>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 max-w-2xl text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

export function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-safelight" />
      {label}
    </label>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      role="status"
      className={`mb-6 max-w-2xl rounded-lg border px-4 py-3 text-sm ${
        error ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-ok"
      }`}
    >
      {error ?? ok}
    </p>
  );
}

/** Row wrapper for inline-edit forms. */
export function Row({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-4 ${muted ? "opacity-60" : ""}`}>{children}</div>
  );
}

export const toRupees = (paise: number | null | undefined) => (paise == null ? "" : String(paise / 100));

export type Search = Promise<{ ok?: string; error?: string }>;
