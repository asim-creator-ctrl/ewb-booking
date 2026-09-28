"use server";

// The success page's "didn't get the email?" resend form. Always redirects
// back to the same page (with the original token still in the URL, if there
// was one) so the flash message renders in place.
import { redirect } from "next/navigation";
import { resendDownloadLink } from "@/lib/downloads";

export async function resendDownloadLinkAction(fd: FormData) {
  const email = String(fd.get("email") ?? "");
  const token = String(fd.get("token") ?? "");
  const result = await resendDownloadLink({ email });

  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set(result.ok ? "resendOk" : "resendError", result.ok ? "1" : (result.error ?? "Could not resend."));
  redirect(`/products/success?${params.toString()}`);
}
