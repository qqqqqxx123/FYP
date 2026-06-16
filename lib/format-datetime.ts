const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";

function parseDateValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

/** Format a timestamp for display in Hong Kong time (UTC+8). */
export function formatHongKongDateTime(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return String(value ?? "").trim();

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  function get(type: Intl.DateTimeFormatPartTypes): string {
    return parts.find((part) => part.type === type)?.value ?? "";
  }

  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
