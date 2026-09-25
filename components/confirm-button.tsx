"use client";

// Submit button that asks before a destructive action.
export function ConfirmButton({
  formAction, children, message = "Delete this? This can't be undone.",
}: { formAction: (fd: FormData) => void | Promise<void>; children: React.ReactNode; message?: string }) {
  return (
    <button
      type="submit"
      formAction={formAction}
      formNoValidate
      className="btn btn-danger"
      onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}
    >
      {children}
    </button>
  );
}
