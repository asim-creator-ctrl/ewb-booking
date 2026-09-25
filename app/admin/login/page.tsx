import { sendLoginLink } from "./actions";

const errors: Record<string, string> = {
  email: "Enter a valid email address.",
  link: "That login link has expired or was already used. Request a new one.",
  not_admin: "This account doesn't have admin access.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <p className="font-display text-2xl tracking-wide">EDITORWALABHAIYA</p>
      <h1 className="mt-8 text-lg font-semibold">Admin login</h1>
      {sent ? (
        <p className="mt-3 text-muted">If that email has admin access, a login link is on its way. Open it on this device.</p>
      ) : (
        <form action={sendLoginLink} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Email</span>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </label>
          {error && <p className="text-sm text-danger">{errors[error] ?? "Something went wrong. Try again."}</p>}
          <button className="btn btn-primary mt-2">Send login link</button>
        </form>
      )}
    </main>
  );
}
