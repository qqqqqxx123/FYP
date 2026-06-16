"use client";

import { DashboardColorPickerPopover } from "@/components/dashboard-color-picker";
import {
  CARD_COLOR_HEADER_BAR_STYLE,
  DASHBOARD_HEADER_COLOR_STORAGE_KEY,
  isCardColorId,
  type CardColorId,
} from "@/lib/dashboard-card-colors";
import { useEffect, useState } from "react";
import { DashboardNav } from "./dashboard-nav";
import { DashboardUserBar } from "./dashboard-user-bar";

interface DashboardHeaderProps {
  username: string;
}

export function DashboardHeader({ username }: DashboardHeaderProps) {
  const [colorId, setColorId] = useState<CardColorId>("orange");

  useEffect(() => {
    const saved = window.localStorage.getItem(DASHBOARD_HEADER_COLOR_STORAGE_KEY);
    if (saved && isCardColorId(saved)) setColorId(saved);
  }, []);

  const theme = CARD_COLOR_HEADER_BAR_STYLE[colorId];

  function handleColorChange(nextColorId: CardColorId) {
    setColorId(nextColorId);
    window.localStorage.setItem(DASHBOARD_HEADER_COLOR_STORAGE_KEY, nextColorId);
  }

  return (
    <header
      className="sticky top-0 z-10 border-b border-white/15 shadow-md"
      style={{ backgroundImage: theme }}
    >
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <DashboardNav />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <DashboardColorPickerPopover value={colorId} onChange={handleColorChange} />
          <DashboardUserBar username={username} />
        </div>
      </div>
    </header>
  );
}
