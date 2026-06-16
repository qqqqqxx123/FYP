const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;

/** New AI.S.D.S base (User Scam Report workspace). */
export const NOCODB_SCAM_REPORT_BASE_ID =
  process.env.NOCODB_User_Scam_Report?.trim() ||
  process.env.NOCODB_SCAM_REPORT_BASE_ID?.trim() ||
  "";

export const WHATSAPP_TEMPLATE_TABLE_ID =
  process.env.WHATSAPP_TEMPLATE_TABLE_ID?.trim() || "m5wc8xbhck7b4y5";

export function getWhatsappTemplateHeaders(): Record<string, string> {
  return {
    "xc-token": NOCODB_API_TOKEN || "",
    "Content-Type": "application/json",
  };
}

export function isWhatsappTemplateNocodbConfigured(): boolean {
  return Boolean(NOCODB_BASE_URL && NOCODB_API_TOKEN && WHATSAPP_TEMPLATE_TABLE_ID);
}

function buildV2Url(recordId?: string, query = ""): string {
  const suffix = recordId
    ? `/records/${encodeURIComponent(String(recordId))}`
    : `/records${query ? (query.startsWith("?") ? query : `?${query}`) : ""}`;
  return `${NOCODB_BASE_URL}/api/v2/tables/${WHATSAPP_TEMPLATE_TABLE_ID}${suffix}`;
}

function buildV1Url(recordId?: string, query = ""): string | null {
  if (!NOCODB_SCAM_REPORT_BASE_ID) return null;
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  if (recordId) {
    return `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_SCAM_REPORT_BASE_ID}/${WHATSAPP_TEMPLATE_TABLE_ID}/${encodeURIComponent(String(recordId))}${q}`;
  }
  return `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_SCAM_REPORT_BASE_ID}/${WHATSAPP_TEMPLATE_TABLE_ID}${q}`;
}

/** Try NocoDB v2 first, then v1 against the User Scam Report base. */
export async function fetchWhatsappTemplateNocodb(
  init?: RequestInit,
  options?: { recordId?: string; query?: string }
): Promise<Response> {
  const { recordId, query = "" } = options ?? {};
  const headers = { ...getWhatsappTemplateHeaders(), ...(init?.headers as Record<string, string>) };
  const requestInit: RequestInit = { ...init, headers, cache: "no-store" };

  const v2Res = await fetch(buildV2Url(recordId, query), requestInit);
  if (v2Res.ok || !NOCODB_SCAM_REPORT_BASE_ID) return v2Res;

  const v1Url = buildV1Url(recordId, query);
  if (!v1Url) return v2Res;

  const v1Res = await fetch(v1Url, requestInit);
  return v1Res.ok ? v1Res : v2Res;
}
