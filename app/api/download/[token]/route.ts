// The only way a preset pack is ever reached: validates the token (not
// expired, downloads remaining), counts the download, and 302s straight to a
// short-lived signed URL for the private product-files object. Never a
// public URL, never listable, never reusable past its limits.
import { NextResponse } from "next/server";
import { redeemDownloadToken } from "@/lib/downloads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await redeemDownloadToken(token);

  if (!result.ok) {
    const url = new URL("/products/success", req.url);
    url.searchParams.set("token", token);
    url.searchParams.set("dlError", result.error);
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(result.signedUrl);
}
