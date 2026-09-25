import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book a shoot · EDITORWALABHAIYA",
  description: "Check availability, see the price and book a shoot with EditorWalaBhaiya.",
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
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
