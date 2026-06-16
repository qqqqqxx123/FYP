"use client";

import { PortalLogo } from "@/components/portal-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/whatsapp-connect", label: "WhatsApp Connect" },
  { href: "/dashboard/whatsapp-templates", label: "Report Scam" },
  { href: "/dashboard/whatsapp-inbox", label: "View WhatsApp" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 flex-1 flex-nowrap items-center gap-3 overflow-x-auto">
      <PortalLogo href="/dashboard" size={36} className="rounded-lg bg-white/10 p-0.5" />
      <div className="flex shrink-0 flex-nowrap items-center gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-[1.024rem] font-medium transition-colors ${
              pathname === item.href
                ? "bg-white/20 text-white shadow-sm"
                : "text-amber-50/95 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
