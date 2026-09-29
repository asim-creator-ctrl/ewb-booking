import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

// GA4 measurement ID for the live-traffic dashboard at analytics.google.com.
// Not a secret — every gtag.js snippet ships this to the browser regardless
// of whether it's inlined here or read from an env var — so it's kept as a
// plain constant rather than adding a Vercel env var the site would depend on.
const GA_MEASUREMENT_ID = "G-0RNQDHHJNE";

export const metadata: Metadata = {
  title: "EDITORWALABHAIYA",
  description: "Book a shoot or browse digital products from EditorWalaBhaiya.",
};

export const viewport: Viewport = { themeColor: "#16120e", width: "device-width", initialScale: 1 };

// Only field this layout needs from settings — a single-column read on every
// request, same "always live, no cache" rule as the rest of the app: an
// admin's background change shows up on the very next page load.
export const dynamic = "force-dynamic";

async function getBgImageUrl(): Promise<string | null> {
  const { createServiceClient } = await import("@/lib/supabase/service");
  const db = createServiceClient();
  const { data } = await db.from("settings").select("bg_image_url").eq("id", 1).single();
  return data?.bg_image_url ?? null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const bgImageUrl = await getBgImageUrl();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-dvh">
        <div
          className="app-bg"
          aria-hidden
          style={bgImageUrl ? { backgroundImage: `url(${bgImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        />
        {children}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
