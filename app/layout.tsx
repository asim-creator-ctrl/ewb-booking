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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=Gloock&display=swap"
        />
      </head>
      <body className="min-h-dvh">
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
