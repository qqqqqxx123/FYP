import { PortalLogo } from "@/components/portal-logo";
import { DashboardQuickLinks } from "./dashboard-quick-links";

export default function DashboardPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 py-6">
      <header className="px-4 py-2 text-center">
        <PortalLogo size={80} className="mx-auto mb-4" />
        <h1 className="bg-gradient-to-r from-amber-800 via-orange-600 to-rose-600 bg-clip-text text-4xl font-semibold tracking-tight text-transparent">
          AI Scam Detect System
        </h1>
      </header>
      <div className="w-full">
        <DashboardQuickLinks />
      </div>
    </div>
  );
}
