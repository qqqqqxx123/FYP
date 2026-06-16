import QRCode from "qrcode";

export function normalizeBridgePhone(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;

  const jidUser = value.includes("@") ? value.split("@")[0] : value;
  const digits = jidUser.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return `+${digits}`;
}

export function parseBridgeStatusPayload(data: Record<string, unknown>): {
  connected: boolean;
  phone?: string;
} {
  const phone =
    normalizeBridgePhone(data.phone) ??
    normalizeBridgePhone(data.phoneNumber) ??
    normalizeBridgePhone(data.number) ??
    normalizeBridgePhone(data.user) ??
    normalizeBridgePhone(data.whatsappNumber) ??
    normalizeBridgePhone(data.connectedLineNumber) ??
    normalizeBridgePhone(data.Whatsapp_Number) ??
    normalizeBridgePhone((data.wid as { user?: string } | undefined)?.user) ??
    normalizeBridgePhone((data.info as { wid?: { user?: string } } | undefined)?.wid?.user) ??
    normalizeBridgePhone((data.info as { me?: { user?: string } } | undefined)?.me?.user) ??
    normalizeBridgePhone(data.jid) ??
    normalizeBridgePhone(data.me);

  const statusValue = String(data.status ?? data.state ?? "").toLowerCase();
  const connected =
    Boolean(
      data.connected === true ||
        data.ready === true ||
        (data.success === true && statusValue === "connected") ||
        statusValue === "connected" ||
        statusValue === "open" ||
        statusValue === "ready"
    ) || Boolean(phone);

  return { connected, phone: phone ?? undefined };
}

export async function qrStringToDataUrl(qrString: string): Promise<string> {
  if (qrString.startsWith("data:")) return qrString;
  if (qrString.includes("@") || qrString.includes(",")) {
    try {
      return await QRCode.toDataURL(qrString, { width: 280, margin: 1 });
    } catch {
      return `data:image/png;base64,${qrString}`;
    }
  }
  return `data:image/png;base64,${qrString}`;
}

export async function parseBridgeStatusResponse(
  data: Record<string, unknown>
): Promise<{ connected: boolean; phone?: string; qr?: string }> {
  const parsed = parseBridgeStatusPayload(data);
  let qr =
    (typeof data.qr === "string" ? data.qr : undefined) ??
    (typeof data.qrCode === "string" ? data.qrCode : undefined);
  if (qr) qr = await qrStringToDataUrl(qr);

  return {
    connected: parsed.connected,
    phone: parsed.phone,
    qr: parsed.connected ? undefined : qr,
  };
}

export function buildBaileySessionStatusUrls(baseUrl: string, sessionId: string): string[] {
  const encoded = encodeURIComponent(sessionId);
  return [
    `${baseUrl}/api/session-status?sessionId=${encoded}`,
    `${baseUrl}/api/session-info?sessionId=${encoded}`,
    `${baseUrl}/api/session-info/${encoded}`,
    `${baseUrl}/status?sessionId=${encoded}`,
  ];
}

export async function fetchBaileySessionStatus(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>,
  fetchWithTimeout: (url: string, init?: RequestInit) => Promise<Response>
): Promise<{ connected: boolean; phone?: string; qr?: string } | null> {
  for (const url of buildBaileySessionStatusUrls(baseUrl, sessionId)) {
    try {
      const res = await fetchWithTimeout(url, { headers });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return await parseBridgeStatusResponse(data);
    } catch {
      continue;
    }
  }
  return null;
}
