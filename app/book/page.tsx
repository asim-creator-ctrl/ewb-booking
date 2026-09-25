import { loadBookingConfig } from "@/lib/config";
import { Wizard } from "@/components/booking/wizard";

export const dynamic = "force-dynamic";

export default async function BookPage() {
  const config = await loadBookingConfig();
  return <Wizard initialConfig={config} />;
}
