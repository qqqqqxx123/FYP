import { DashboardPageBanner } from "@/components/dashboard-page-banner";
import { WhatsAppConnectClient } from "./whatsapp-connect-client";

export default function WhatsAppConnectPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <DashboardPageBanner
        title="WhatsApp Connect"
        subtitle="Connect your WhatsApp account to AI.S.D.S. Click Connect to generate a QR code, then scan it with WhatsApp on your phone."
        imageSrc="/whatsapp-connect-banner.png"
        imageAlt="WhatsApp connect illustration"
      />

      <WhatsAppConnectClient />
    </div>
  );
}
