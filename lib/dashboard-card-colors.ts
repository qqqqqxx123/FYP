export const DASHBOARD_HEADER_COLOR_STORAGE_KEY = "dashboard-header-color";
export const WHATSAPP_CONNECT_CARD_COLOR_STORAGE_KEY = "whatsapp-connect-card-color";

export function getWhatsAppConnectCardColorStorageKey(sessionId: string): string {
  return `${WHATSAPP_CONNECT_CARD_COLOR_STORAGE_KEY}:${sessionId}`;
}

export function readWhatsAppConnectCardColor(
  sessionId: string,
  options?: { useLegacySlot1Key?: boolean },
): CardColorId | null {
  if (typeof window === "undefined") return null;

  const saved = window.localStorage.getItem(getWhatsAppConnectCardColorStorageKey(sessionId));
  if (saved && isCardColorId(saved)) return saved;

  if (options?.useLegacySlot1Key) {
    const legacy = window.localStorage.getItem(WHATSAPP_CONNECT_CARD_COLOR_STORAGE_KEY);
    if (legacy && isCardColorId(legacy)) {
      window.localStorage.setItem(getWhatsAppConnectCardColorStorageKey(sessionId), legacy);
      return legacy;
    }
  }

  return null;
}

export function pickDistinctCardColor(usedColors: CardColorId[]): CardColorId {
  const unused = CARD_COLOR_OPTIONS.find((option) => !usedColors.includes(option.id));
  if (unused) return unused.id;
  return CARD_COLOR_OPTIONS[usedColors.length % CARD_COLOR_OPTIONS.length].id;
}

export const CARD_COLOR_OPTIONS = [
  {
    id: "emerald",
    label: "Green",
    swatch: "bg-gradient-to-br from-emerald-600 to-teal-600",
    header: "bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600",
    headerBar: "bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600",
    accent: "text-emerald-600",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    id: "pink",
    label: "Pink",
    swatch: "bg-gradient-to-br from-pink-500 to-rose-500",
    header: "bg-gradient-to-br from-pink-500 via-pink-500 to-rose-500",
    headerBar: "bg-gradient-to-r from-pink-500 via-pink-500 to-rose-500",
    accent: "text-pink-600",
    badge: "border-pink-200 bg-pink-50 text-pink-800",
  },
  {
    id: "blue",
    label: "Blue",
    swatch: "bg-gradient-to-br from-sky-500 to-indigo-600",
    header: "bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600",
    headerBar: "bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-600",
    accent: "text-blue-600",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
  },
  {
    id: "violet",
    label: "Purple",
    swatch: "bg-gradient-to-br from-violet-500 to-purple-600",
    header: "bg-gradient-to-br from-violet-500 via-purple-500 to-purple-600",
    headerBar: "bg-gradient-to-r from-violet-500 via-purple-500 to-purple-600",
    accent: "text-violet-600",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    id: "orange",
    label: "Orange",
    swatch: "bg-gradient-to-br from-orange-500 to-amber-600",
    header: "bg-gradient-to-br from-orange-500 via-orange-500 to-amber-600",
    headerBar: "bg-gradient-to-r from-amber-700 via-orange-600 to-rose-600",
    accent: "text-orange-600",
    badge: "border-orange-200 bg-orange-50 text-orange-800",
  },
] as const;

export type CardColorId = (typeof CARD_COLOR_OPTIONS)[number]["id"];

/** Inline gradients so swatches always render (not stripped by Tailwind purge). */
export const CARD_COLOR_SWATCH_STYLE: Record<CardColorId, string> = {
  emerald: "linear-gradient(to bottom right, #059669, #0d9488)",
  pink: "linear-gradient(to bottom right, #ec4899, #f43f5e)",
  blue: "linear-gradient(to bottom right, #0ea5e9, #4f46e5)",
  violet: "linear-gradient(to bottom right, #8b5cf6, #9333ea)",
  orange: "linear-gradient(to bottom right, #f97316, #d97706)",
};

export const CARD_COLOR_HEADER_BAR_STYLE: Record<CardColorId, string> = {
  emerald: "linear-gradient(to right, #059669, #059669, #0d9488)",
  pink: "linear-gradient(to right, #ec4899, #ec4899, #f43f5e)",
  blue: "linear-gradient(to right, #0ea5e9, #2563eb, #4f46e5)",
  violet: "linear-gradient(to right, #8b5cf6, #a855f7, #9333ea)",
  orange: "linear-gradient(to right, #b45309, #ea580c, #e11d48)",
};

export function isCardColorId(value: string): value is CardColorId {
  return CARD_COLOR_OPTIONS.some((option) => option.id === value);
}

export function getCardColorTheme(colorId: CardColorId) {
  return CARD_COLOR_OPTIONS.find((option) => option.id === colorId) ?? CARD_COLOR_OPTIONS[0];
}
