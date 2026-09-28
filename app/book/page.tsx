import type { Metadata } from "next";
import { loadBookingConfig } from "@/lib/config";
import { isRazorpayConfigured } from "@/lib/razorpay";
import { Wizard } from "@/components/booking/wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a shoot · EDITORWALABHAIYA",
  description: "Check availability, see the price and book a shoot with EditorWalaBhaiya.",
};

export default async function BookPage() {
  const config = await loadBookingConfig();
  return <Wizard initialConfig={config} razorpayConfigured={isRazorpayConfigured()} />;
}
