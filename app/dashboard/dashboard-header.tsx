"use client";

import { DashboardColorPickerPopover } from "@/components/dashboard-color-picker";
import { useDashboardHeaderColor } from "@/lib/use-dashboard-header-color";
import { DashboardNav } from "./dashboard-nav";
import { DashboardUserBar } from "./dashboard-user-bar";

interface DashboardHeaderProps {
  username: string;
}

export function DashboardHeader({ username }: DashboardHeaderProps) {
  const { colorId, headerBarStyle, setHeaderColorId } = useDashboardHeaderColor();

  return (
    <header
      className="sticky top-0 z-10 border-b border-white/15 shadow-md"
      style={{ backgroundImage: headerBarStyle }}
    >
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <DashboardNav />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DashboardColorPickerPopover value={colorId} onChange={setHeaderColorId} />
          <DashboardUserBar username={username} />
        </div>
      </div>
    </header>
  );
}
