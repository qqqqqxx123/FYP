import { parseBridgeStatusResponse } from "@/lib/whatsapp-bridge-status";
import { getWhatsAppConnectionForUser, upsertWhatsAppConnectionForUser } from "@/lib/nocodb";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

const BAILEYS_API_URL = (process.env.BAILEYS_API_URL ?? process.env.BAILEY_API_URL)?.replace(/\/$/, "");
const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL?.replace(/\/$/, "");
const WA_BRIDGE_API_KEY = process.env.WA_BRIDGE_API_KEY?.trim();
const WHATSAPP_FETCH_TIMEOUT_MS = Number(process.env.WHATSAPP_FETCH_TIMEOUT_MS ?? 6000);
const WHATSAPP_START_TIMEOUT_MS = Number(process.env.WHATSAPP_START_TIMEOUT_MS ?? 30000);

/** Optional: exact path for starting a session (e.g. /api/start or /session/start). POST with body { session: "1" }. */
const WA_BRIDGE_START_PATH = process.env.WA_BRIDGE_START_PATH?.trim();

/** Prefer wa-bridge (VPS); fallback to Baileys server. */
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

function fetchWithStartTimeout(url: string, init?: RequestInit) {
  return fetchWithTimeout(url, init, WHATSAPP_START_TIMEOUT_MS);
}

function normalizePhone(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return undefined;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function startBaileyBridgeSession(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; qr?: string; phone?: string; error?: string; unsupported?: boolean } | null> {
  const startPath = WA_BRIDGE_START_PATH ?? "/api/start-session";
  const url = `${baseUrl}${startPath.startsWith("/") ? startPath : `/${startPath}`}`;

  try {
    const res = await fetchWithStartTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session: sessionId,
        sessionId,
        name: sessionId,
      }),
    });
    if (res.status === 404) return { ok: false, unsupported: true };

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = String(data.message ?? data.error ?? res.statusText);
      return { ok: false, error: message };
    }

    const parsed = await parseBridgeStatusResponse(data);
    if (parsed.phone) return { ok: true, phone: parsed.phone, qr: parsed.qr };
    return { ok: true, qr: parsed.qr };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return { ok: false, error: message };
  }
}

async function fetchWwebjsQr(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<string | null> {
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
    if (!qrRes.ok) return null;
    const data = (await qrRes.json().catch(() => ({}))) as {
      qr?: string;
      qrcode?: string;
      data?: string;
    };
    const raw = data.qr ?? data.qrcode ?? data.data;
    if (!raw) return null;
    return await qrStringToDataUrl(raw);
  } catch {
    return null;
  }
}

/** Convert raw QR string to data URL image. Baileys returns raw strings like "2@Xd3D73vu..." */
async function qrStringToDataUrl(qrString: string): Promise<string> {
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

/**
 * Start WhatsApp connection for the logged-in user.
 * Returns { started: true } or { qr }; client polls GET /api/whatsapp/status for qr/phone.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string };
    const { userId, sessionId } = await requireWhatsAppUser({
      sessionId: body.sessionId,
    });

    const existing = await getWhatsAppConnectionForUser(userId, sessionId);
    if (!existing) {
      await upsertWhatsAppConnectionForUser(userId, sessionId, null, "disconnected");
    }

    const base = getBridgeBase();
    if (!base) {
      return NextResponse.json(
        {
          message:
            "WhatsApp bridge not configured. Set WA_BRIDGE_URL (e.g. http://72.62.163.6:3001) or BAILEYS_API_URL / BAILEY_API_URL in .env.local.",
        },
        { status: 501 }
      );
    }

    const headers = getWaBridgeHeaders();

    if (WA_BRIDGE_URL) {
      const baileyStart = await startBaileyBridgeSession(WA_BRIDGE_URL, sessionId, headers);
      if (baileyStart?.ok) {
        if (baileyStart.qr) return NextResponse.json({ started: true, qr: baileyStart.qr });
        if (baileyStart.phone) return NextResponse.json({ started: true, phone: baileyStart.phone });
        return NextResponse.json({ started: true });
      }
      if (baileyStart?.error && !baileyStart.unsupported) {
        return NextResponse.json(
          { message: `Failed to start WhatsApp bridge session: ${baileyStart.error}` },
          { status: 502 }
        );
      }

      // wwebjs-api style: GET /session/start/:sessionId
      let hasStarted = false;
      let lastErr: Error | null = null;

      try {
        const startRes = await fetchWithTimeout(
          `${WA_BRIDGE_URL}/session/start/${encodeURIComponent(sessionId)}`,
          { headers }
        );
        if (startRes.ok) {
          hasStarted = true;
          const qr = await fetchWwebjsQr(WA_BRIDGE_URL, sessionId, headers);
          if (qr) return NextResponse.json({ started: true, qr });
          return NextResponse.json({ started: true });
        }
        const startData = (await startRes.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        const startErrorMessage = startData.message ?? startData.error ?? startRes.statusText;
        if (startErrorMessage) {
          lastErr = new Error(startErrorMessage);
          if (startRes.status !== 404) {
            return NextResponse.json(
              { message: `Failed to start WhatsApp bridge session: ${startErrorMessage}` },
              { status: 502 }
            );
          }
        }
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json(
          { message: `Failed to start WhatsApp bridge session: ${lastErr.message}` },
          { status: 502 }
        );
      }

      // First try GET /qr (for wa-bridge that auto-starts and serves QR via GET)
      try {
        const qrRes = await fetchWithTimeout(`${WA_BRIDGE_URL}/qr`, { headers });
        if (qrRes.ok) {
          const contentType = qrRes.headers.get("content-type") ?? "";
          if (contentType.includes("image/")) {
            const buf = await qrRes.arrayBuffer();
            const base64 = Buffer.from(buf).toString("base64");
            return NextResponse.json({ started: true, qr: `data:image/png;base64,${base64}` });
          }
          const data = (await qrRes.json().catch(() => ({}))) as { qr?: string; expiresAt?: string };
          if (data.qr) {
            const qr = await qrStringToDataUrl(data.qr);
            return NextResponse.json({ started: true, qr });
          }
        }
      } catch {
        // GET /qr failed, try POST start endpoints below
      }

      // Try POST start endpoints
      const startBody = { session: sessionId, sessionId, name: sessionId };
      const startUrls = WA_BRIDGE_START_PATH
        ? [`${WA_BRIDGE_URL}${WA_BRIDGE_START_PATH.startsWith("/") ? WA_BRIDGE_START_PATH : `/${WA_BRIDGE_START_PATH}`}`]
        : [
            `${WA_BRIDGE_URL}/api/start-session`,
            `${WA_BRIDGE_URL}/start`,
            `${WA_BRIDGE_URL}/connect`,
            `${WA_BRIDGE_URL}/api/start`,
            `${WA_BRIDGE_URL}/session/start`,
            `${WA_BRIDGE_URL}/api/sessions/start`,
            `${WA_BRIDGE_URL}/api/session/start`,
            `${WA_BRIDGE_URL}/sessions/start`,
          ];
      for (const url of startUrls) {
        try {
          const res = await fetchWithTimeout(url, {
            method: "POST",
            headers,
            body: JSON.stringify(startBody),
          });
          const data = (await res.json().catch(() => ({}))) as {
            qr?: string;
            qrCode?: string;
            started?: boolean;
            success?: boolean;
            message?: string;
          };
          if (res.ok) {
            hasStarted = true;
            if (data.qr || data.qrCode) {
              const qrRaw = (data.qr ?? data.qrCode) as string;
              const qr = await qrStringToDataUrl(qrRaw);
              return NextResponse.json({ started: true, qr });
            }
            return NextResponse.json({ started: true });
          }
          lastErr = new Error((data.message as string) ?? res.statusText);
        } catch (e) {
          lastErr = e instanceof Error ? e : new Error(String(e));
        }
      }

      // If start succeeded but no QR yet, let the client poll.
      const qr = await fetchWwebjsQr(WA_BRIDGE_URL, sessionId, headers);
      if (qr) return NextResponse.json({ started: true, qr });
      if (hasStarted) return NextResponse.json({ started: true });

      const message = lastErr?.message
        ? `Failed to start WhatsApp bridge session: ${lastErr.message}`
        : "Failed to start WhatsApp bridge session. Check WA_BRIDGE_START_PATH for your bridge API.";
      return NextResponse.json({ message }, { status: 502 });
    }

    // Baileys server
    const res = await fetchWithTimeout(
      `${BAILEYS_API_URL}/connect?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    );
    const data = (await res.json().catch(() => ({}))) as { started?: boolean; message?: string };
    if (!res.ok) {
      return NextResponse.json(
        { message: (data as { message?: string }).message ?? "Baileys server error" },
        { status: res.status }
      );
    }
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        {
          message:
            "Your account could not be verified. Please log out, sign in again, then retry Connect.",
        },
        { status: 401 }
      );
    }
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ message }, { status: 502 });
  }
}
