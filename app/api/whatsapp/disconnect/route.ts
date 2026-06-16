import { upsertWhatsAppConnectionForUser } from "@/lib/nocodb";
import {
  deleteWhatsAppMessagesForSession,
  isWhatsAppInboxNocoDBConfigured,
} from "@/lib/whatsapp-inbox-nocodb";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";
import { NextResponse } from "next/server";

const BAILEYS_API_URL = (process.env.BAILEYS_API_URL ?? process.env.BAILEY_API_URL)?.replace(/\/$/, "");
const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL?.replace(/\/$/, "");
const WA_BRIDGE_API_KEY = process.env.WA_BRIDGE_API_KEY?.trim();
const WA_BRIDGE_LOGOUT_PATH = process.env.WA_BRIDGE_LOGOUT_PATH?.trim() ?? "/api/logout-session";
const WHATSAPP_FETCH_TIMEOUT_MS = Number(process.env.WHATSAPP_FETCH_TIMEOUT_MS ?? 15000);

function getWaBridgeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (WA_BRIDGE_API_KEY) {
    headers["X-API-Key"] = WA_BRIDGE_API_KEY;
    headers["x-api-key"] = WA_BRIDGE_API_KEY;
  }
  return headers;
}

function isSessionAlreadyGone(status: number, message: string): boolean {
  if (status === 404) return true;
  const normalized = message.trim().toLowerCase();
  return (
    normalized === "not found" ||
    normalized.includes("session not found") ||
    normalized.includes("not found")
  );
}

async function tryBridgeLogoutUrl(
  url: string,
  init: RequestInit
): Promise<{ ok: boolean; alreadyGone: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(WHATSAPP_FETCH_TIMEOUT_MS),
    });

    if (res.ok) return { ok: true, alreadyGone: false };

    const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    const message = data.message ?? data.error ?? res.statusText ?? "Bridge logout failed";

    if (isSessionAlreadyGone(res.status, message)) {
      return { ok: true, alreadyGone: true };
    }

    return { ok: false, alreadyGone: false, error: message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge logout failed";
    return { ok: false, alreadyGone: false, error: message };
  }
}

async function logoutBaileyBridgeSession(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; alreadyGone: boolean; error?: string }> {
  const logoutPath = WA_BRIDGE_LOGOUT_PATH.startsWith("/")
    ? WA_BRIDGE_LOGOUT_PATH
    : `/${WA_BRIDGE_LOGOUT_PATH}`;

  return tryBridgeLogoutUrl(`${baseUrl}${logoutPath}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sessionId }),
  });
}

async function logoutLegacyBridgeSession(
  baseUrl: string,
  sessionId: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; alreadyGone: boolean }> {
  const logoutUrls = [
    `${baseUrl}/api/logout-session`,
    `${baseUrl}/disconnect?sessionId=${encodeURIComponent(sessionId)}`,
    `${baseUrl}/session/stop/${encodeURIComponent(sessionId)}`,
    `${baseUrl}/session/terminate/${encodeURIComponent(sessionId)}`,
  ];
  const logoutBody = { session: sessionId, sessionId, name: sessionId };

  let sawAlreadyGone = false;

  for (const logoutUrl of logoutUrls) {
    const isGet =
      logoutUrl.includes("/session/stop/") || logoutUrl.includes("/session/terminate/");
    const result = await tryBridgeLogoutUrl(logoutUrl, {
      method: isGet ? "GET" : "POST",
      headers,
      ...(isGet ? {} : { body: JSON.stringify(logoutBody) }),
    });

    if (result.ok) {
      return { ok: true, alreadyGone: result.alreadyGone };
    }
    if (result.alreadyGone) sawAlreadyGone = true;
  }

  if (sawAlreadyGone) return { ok: true, alreadyGone: true };
  return { ok: false, alreadyGone: false };
}

/**
 * Disconnect the logged-in user's WhatsApp session on the bridge, then update NocoDB.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { source?: string; sessionId?: string };
    const { userId, sessionId } = await requireWhatsAppUser({
      sessionId: body.sessionId,
    });
    const logoutSource = typeof body.source === "string" ? body.source.trim() : "unknown";
    console.log("[LOGOUT REQUEST]", sessionId, logoutSource, new Date().toISOString());

    const headers = getWaBridgeHeaders();
    let bridgeLoggedOut = false;
    let sessionAlreadyGone = false;

    if (WA_BRIDGE_URL) {
      const result = await logoutBaileyBridgeSession(WA_BRIDGE_URL, sessionId, headers);
      if (result.ok) {
        bridgeLoggedOut = true;
        sessionAlreadyGone = result.alreadyGone;
      } else {
        const legacy = await logoutLegacyBridgeSession(WA_BRIDGE_URL, sessionId, headers);
        bridgeLoggedOut = legacy.ok;
        sessionAlreadyGone = legacy.alreadyGone;
        if (!bridgeLoggedOut) {
          return NextResponse.json(
            { message: result.error ?? "Failed to disconnect WhatsApp session on bridge" },
            { status: 502 }
          );
        }
      }
    } else if (BAILEYS_API_URL) {
      const result = await logoutBaileyBridgeSession(BAILEYS_API_URL, sessionId, headers);
      if (result.ok) {
        bridgeLoggedOut = true;
        sessionAlreadyGone = result.alreadyGone;
      } else {
        const legacy = await logoutLegacyBridgeSession(BAILEYS_API_URL, sessionId, headers);
        bridgeLoggedOut = legacy.ok;
        sessionAlreadyGone = legacy.alreadyGone;
        if (!bridgeLoggedOut) {
          return NextResponse.json(
            { message: result.error ?? "Failed to disconnect WhatsApp session on bridge" },
            { status: 502 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { message: "WhatsApp bridge is not configured" },
        { status: 501 }
      );
    }

    await upsertWhatsAppConnectionForUser(userId, sessionId, null, "disconnected");

    let deletedMessages = 0;
    if (logoutSource === "user_disconnect_button" && isWhatsAppInboxNocoDBConfigured()) {
      try {
        deletedMessages = await deleteWhatsAppMessagesForSession(sessionId);
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[disconnect] deleted ${deletedMessages} Whatsapp_Message rows for ${sessionId}`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[disconnect] failed to delete inbox messages for ${sessionId}:`, message);
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      disconnected: bridgeLoggedOut,
      sessionAlreadyGone,
      deletedMessages,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const message = error instanceof Error ? error.message : "Disconnect failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
