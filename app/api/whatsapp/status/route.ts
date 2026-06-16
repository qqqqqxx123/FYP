import {
  fetchBaileySessionStatus,
  parseBridgeStatusPayload,
  parseBridgeStatusResponse,
  qrStringToDataUrl,
} from "@/lib/whatsapp-bridge-status";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";
import { NextResponse } from "next/server";

const BAILEYS_API_URL = (process.env.BAILEYS_API_URL ?? process.env.BAILEY_API_URL)?.replace(/\/$/, "");
const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL?.replace(/\/$/, "");
const WA_BRIDGE_API_KEY = process.env.WA_BRIDGE_API_KEY?.trim();
const WHATSAPP_FETCH_TIMEOUT_MS = Number(process.env.WHATSAPP_FETCH_TIMEOUT_MS ?? 6000);

/** Optional: path for status/QR, use :sessionId or :slot for session key. */
const WA_BRIDGE_STATUS_PATH = process.env.WA_BRIDGE_STATUS_PATH?.trim();

function resolveBridgeStatusPath(pathTemplate: string, sessionId: string): string {
  return pathTemplate.replace(/:sessionId/g, encodeURIComponent(sessionId)).replace(/:slot/g, encodeURIComponent(sessionId));
}

function getBridgeBase(): string | null {
  if (WA_BRIDGE_URL) return WA_BRIDGE_URL;
  if (BAILEYS_API_URL) return BAILEYS_API_URL;
  return null;
}

/** Get headers for wa-bridge requests (includes API key if set). */
function getWaBridgeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WA_BRIDGE_API_KEY) {
    headers["X-API-Key"] = WA_BRIDGE_API_KEY;
    headers["x-api-key"] = WA_BRIDGE_API_KEY;
  }
  return headers;
}

function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = WHATSAPP_FETCH_TIMEOUT_MS) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

function normalizePhone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return undefined;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function fetchBaileySessionStatusFromBridge(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
) {
  return fetchBaileySessionStatus(baseUrl, sessionId, headers, fetchWithTimeout);
}

async function fetchWwebjsPhone(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<string | undefined> {
  try {
    const infoRes = await fetchWithTimeout(
      `${baseUrl}/client/getClassInfo/${encodeURIComponent(sessionId)}`,
      { headers }
    );
    if (!infoRes.ok) return undefined;
    const data = (await infoRes.json().catch(() => ({}))) as Record<string, unknown>;
    return (
      normalizePhone(data.phone) ??
      normalizePhone(data.number) ??
      normalizePhone((data.wid as { user?: string } | undefined)?.user) ??
      normalizePhone((data.info as { wid?: { user?: string } } | undefined)?.wid?.user) ??
      normalizePhone(data.me)
    );
  } catch {
    return undefined;
  }
}

async function fetchWwebjsQr(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<string | undefined> {
  try {
    const qrImgRes = await fetchWithTimeout(
      `${baseUrl}/session/qr/${encodeURIComponent(sessionId)}/image`,
      { headers }
    );
    if (qrImgRes.ok) {
      const buf = await qrImgRes.arrayBuffer();
      const base64 = Buffer.from(buf).toString("base64");
      return `data:image/png;base64,${base64}`;
    }
  } catch {
    // Fallback below
  }

  try {
    const qrRes = await fetchWithTimeout(
      `${baseUrl}/session/qr/${encodeURIComponent(sessionId)}`,
      { headers }
    );
    if (!qrRes.ok) return undefined;
    const data = (await qrRes.json().catch(() => ({}))) as {
      qr?: string;
      qrcode?: string;
      data?: string;
    };
    const raw = data.qr ?? data.qrcode ?? data.data;
    if (!raw) return undefined;
    return await qrStringToDataUrl(raw);
  } catch {
    return undefined;
  }
}

async function fetchConfiguredSessionStatus(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<{ connected: boolean; phone?: string; qr?: string } | null> {
  if (!WA_BRIDGE_STATUS_PATH) return null;

  const path = resolveBridgeStatusPath(WA_BRIDGE_STATUS_PATH, sessionId);
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) return null;

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return parseBridgeStatusResponse(data);
  } catch {
    return null;
  }
}

/**
 * Get connection status for the logged-in user. Returns { connected, phone?, qr? }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { sessionId } = await requireWhatsAppUser({
      sessionId: searchParams.get("sessionId"),
    });

    const base = getBridgeBase();
    if (!base) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const headers = getWaBridgeHeaders();

    if (WA_BRIDGE_URL) {
      const configuredStatus = await fetchConfiguredSessionStatus(WA_BRIDGE_URL, sessionId, headers);
      if (configuredStatus) return NextResponse.json(configuredStatus);

      const sessionStatus = await fetchBaileySessionStatusFromBridge(
        WA_BRIDGE_URL,
        sessionId,
        headers
      );
      if (sessionStatus) {
        return NextResponse.json(sessionStatus);
      }

      // wwebjs-api style: /session/status/:sessionId
      try {
        const wwebStatusRes = await fetchWithTimeout(
          `${WA_BRIDGE_URL}/session/status/${encodeURIComponent(sessionId)}`,
          { headers }
        );
        if (wwebStatusRes.ok) {
          const data = (await wwebStatusRes.json().catch(() => ({}))) as Record<string, unknown>;
          const state = String(data.state ?? "").toUpperCase();
          const message = String(data.message ?? "").toLowerCase();
          const connected =
            state === "CONNECTED" ||
            state === "READY" ||
            state === "WORKING" ||
            message.includes("session_connected");
          const phone = connected ? await fetchWwebjsPhone(WA_BRIDGE_URL, sessionId, headers) : undefined;
          const qr = !connected ? await fetchWwebjsQr(WA_BRIDGE_URL, sessionId, headers) : undefined;
          return NextResponse.json({ connected, phone, qr });
        }
        if (wwebStatusRes.status !== 404) {
          return NextResponse.json({ connected: false }, { status: 200 });
        }
      } catch {
        return NextResponse.json({ connected: false }, { status: 200 });
      }

    // First check /status (your wa-bridge style - single WhatsApp, no slot)
    try {
      const statusRes = await fetchWithTimeout(`${WA_BRIDGE_URL}/status`, { headers });
      if (statusRes.ok) {
        const data = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
        const connected = !!(
          data.connected ??
          data.ready ??
          (data.status === "connected" || data.state === "open")
        );
        let phone =
          (data.phone as string) ??
          (data.phoneNumber as string) ??
          (data.number as string) ??
          (data.wid as string) ??
          (data.user as string);
        // Add + prefix if missing
        if (phone && !phone.startsWith("+")) phone = `+${phone}`;

        // If not connected, also fetch /qr to get the QR code
        let qr = (data.qr as string) ?? (data.qrCode as string);
        if (!connected && !qr) {
          try {
            const qrRes = await fetchWithTimeout(`${WA_BRIDGE_URL}/qr`, { headers });
            if (qrRes.ok) {
              const contentType = qrRes.headers.get("content-type") ?? "";
              if (contentType.includes("image/")) {
                const buf = await qrRes.arrayBuffer();
                const base64 = Buffer.from(buf).toString("base64");
                qr = `data:image/png;base64,${base64}`;
              } else {
                const qrData = (await qrRes.json().catch(() => ({}))) as { qr?: string };
                if (qrData.qr) qr = qrData.qr;
              }
            }
          } catch {
            // QR fetch failed, continue without it
          }
        }

        // Convert raw QR string to image if needed
        if (qr) qr = await qrStringToDataUrl(qr);
        return NextResponse.json({
          connected,
          phone: phone ?? undefined,
          qr: qr ?? undefined,
        });
      }
    } catch {
      // /status failed, try other endpoints
    }

    // Fallback: try other common endpoint patterns with slot
    const pathWithSession = WA_BRIDGE_STATUS_PATH
      ? resolveBridgeStatusPath(WA_BRIDGE_STATUS_PATH, sessionId)
      : null;
    const statusUrls = pathWithSession
      ? [`${WA_BRIDGE_URL}${pathWithSession.startsWith("/") ? pathWithSession : `/${pathWithSession}`}`]
      : [
          `${WA_BRIDGE_URL}/status?session=${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/session/${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/client/${encodeURIComponent(sessionId)}/status`,
          `${WA_BRIDGE_URL}/api/session/${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/api/sessions/${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/qr?session=${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/api/qr?session=${encodeURIComponent(sessionId)}`,
          `${WA_BRIDGE_URL}/session/${encodeURIComponent(sessionId)}/qr`,
          `${WA_BRIDGE_URL}/session/${encodeURIComponent(sessionId)}/qrcode`,
        ];
    for (const statusUrl of statusUrls) {
      try {
        const res = await fetchWithTimeout(statusUrl, { headers });
        const contentType = res.headers.get("content-type") ?? "";
        if (!res.ok) continue;

        if (contentType.includes("image/")) {
          const buf = await res.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          const qr = `data:image/png;base64,${base64}`;
          return NextResponse.json({ connected: false, qr });
        }

        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const parsed = await parseBridgeStatusResponse(data);
        return NextResponse.json(parsed);
      } catch {
        continue;
      }
    }
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  const baileyStatus = await fetchBaileySessionStatusFromBridge(
    BAILEYS_API_URL,
    sessionId,
    headers
  );
  if (baileyStatus) {
    return NextResponse.json(baileyStatus);
  }

  try {
    const res = await fetchWithTimeout(
      `${BAILEYS_API_URL}/status?sessionId=${encodeURIComponent(sessionId)}`
    );
    const data = (await res.json().catch(() => ({}))) as {
      connected?: boolean;
      phone?: string;
      qr?: string;
    };
    if (!res.ok) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }
    let qr = data.qr;
    if (qr) qr = await qrStringToDataUrl(qr);
    return NextResponse.json({
      connected: !!data.connected,
      phone: data.phone,
      qr,
    });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}
