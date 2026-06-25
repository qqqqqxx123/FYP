"use client";

import { useEffect, useState } from "react";
import {
  CARD_COLOR_HEADER_BAR_STYLE,
  DASHBOARD_HEADER_COLOR_STORAGE_KEY,
  isCardColorId,
  type CardColorId,
} from "@/lib/dashboard-card-colors";

export const DASHBOARD_HEADER_COLOR_CHANGE_EVENT = "dashboard-header-color-change";

export function useDashboardHeaderColor() {
  const [colorId, setColorId] = useState<CardColorId>("orange");

  useEffect(() => {
    function readColor() {
      const saved = window.localStorage.getItem(DASHBOARD_HEADER_COLOR_STORAGE_KEY);
      if (saved && isCardColorId(saved)) setColorId(saved);
    }

    readColor();
    window.addEventListener("storage", readColor);
    window.addEventListener(DASHBOARD_HEADER_COLOR_CHANGE_EVENT, readColor);
    return () => {
      window.removeEventListener("storage", readColor);
      window.removeEventListener(DASHBOARD_HEADER_COLOR_CHANGE_EVENT, readColor);
    };
  }, []);

  function setHeaderColorId(nextColorId: CardColorId) {
    setColorId(nextColorId);
    window.localStorage.setItem(DASHBOARD_HEADER_COLOR_STORAGE_KEY, nextColorId);
    window.dispatchEvent(new Event(DASHBOARD_HEADER_COLOR_CHANGE_EVENT));
  }

  return {
    colorId,
    headerBarStyle: CARD_COLOR_HEADER_BAR_STYLE[colorId],
    setHeaderColorId,
  };
}
