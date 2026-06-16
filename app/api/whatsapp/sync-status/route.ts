import { NextResponse } from "next/server";
import {
  isWhatsAppInboxNocoDBConfigured,
  getLatestMessageTsFromNocoDB,
} from "@/lib/whatsapp-inbox-nocodb";
import {
  createInboxKeyedCache,
  INBOX_NOCO_CACHE_MS,
  isNocoRateLimitError,
} from "@/lib/whatsapp-inbox-api-cache";
import { isBackfilling } from "@/lib/whatsapp-backfill-progress";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";
/** 2 minutes: "caught up" when latest DB message is within this of now. */
const CATCH_UP_THRESHOLD_MS = 120_000;

/** Redact error message for logging (no PII / full stack). */
function redactForLog(msg: string): string {
  return msg.replace(/\b\d{10,}\b/g, "[redacted]").slice(0, 200);
}

interface SyncStatusPayload {
  isBackfilling: boolean;
  latestDbMessageTs: number | null;
  caughtUpToToday: boolean;
  thresholdMs: number;
  updatedAt: number;
  progress?: { stage: string; percent?: number };
  error?: string;
}

const statusCache = createInboxKeyedCache<SyncStatusPayload>();

/**
 * GET /api/whatsapp/sync-status
 * Returns whether the inbox DB is "caught up to today" so the UI can hide the
 * blocking overlay only when truly caught up. latestDbMessageTs is null when
 * messages table is empty. On NocoDB error we return caughtUpToToday: false and
 * a redacted error string so the overlay stays visible.
 */
export async function GET(request: Request) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  const now = Date.now();
  const backfilling = isBackfilling();

  if (!isWhatsAppInboxNocoDBConfigured()) {
    const data: SyncStatusPayload = {
      isBackfilling: false,
      latestDbMessageTs: null,
      caughtUpToToday: true,
      thresholdMs: CATCH_UP_THRESHOLD_MS,
      updatedAt: now,
    };
    if (process.env.NODE_ENV === "development") {
      console.log("[sync-status] latestDbMessageTs=null caughtUpToToday=true isBackfilling=false (nocodb not configured)");
    }
    return NextResponse.json(data, { headers });
  }

  let sessionId: string;
  try {
    const { searchParams } = new URL(request.url);
    ({ sessionId } = await requireWhatsAppUser({
      sessionId: searchParams.get("sessionId"),
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNAUTHORIZED";
    const status = message === "INVALID_SESSION" ? 400 : 401;
    return NextResponse.json({ error: message }, { status, headers });
  }

  const cached = statusCache.get(sessionId);
  if (cached) {
    return NextResponse.json(cached, { headers });
  }

  try {
    const latestDbMessageTs = await getLatestMessageTsFromNocoDB({ sessionId });
    const caughtUpToToday = !backfilling;

    const data: SyncStatusPayload = {
      isBackfilling: backfilling,
      latestDbMessageTs,
      caughtUpToToday,
      thresholdMs: CATCH_UP_THRESHOLD_MS,
      updatedAt: now,
      progress: backfilling ? { stage: "syncing" } : undefined,
    };

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[sync-status] latestDbMessageTs=${latestDbMessageTs ?? "null"} caughtUpToToday=${caughtUpToToday} isBackfilling=${backfilling} hasError=false`
      );
    }

    statusCache.set(sessionId, data, INBOX_NOCO_CACHE_MS);
    return NextResponse.json(data, { headers });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const redacted = redactForLog(errMsg);
    const isRateLimit = isNocoRateLimitError(errMsg);
    const stale = statusCache.getStale(sessionId);

    if (isRateLimit && stale) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[sync-status] NocoDB rate limit — returning cached status");
      }
      return NextResponse.json({ ...stale, updatedAt: now }, { headers });
    }

    const statusMatch = errMsg.match(/failed:\s*(\d{3})/i);
    const code = statusMatch ? statusMatch[1] : null;
    const reason =
      !isRateLimit && code
        ? `Database unreachable (HTTP ${code}). Check server logs for details.`
        : !isRateLimit
          ? "Database unreachable. Check server logs or network."
          : undefined;

    const data: SyncStatusPayload = {
      isBackfilling: backfilling,
      latestDbMessageTs: null,
      caughtUpToToday: isRateLimit ? true : false,
      thresholdMs: CATCH_UP_THRESHOLD_MS,
      updatedAt: now,
      ...(reason ? { error: reason } : {}),
    };

    if (process.env.NODE_ENV === "development") {
      console.warn("[sync-status] NocoDB error:", redacted);
      console.log(
        `[sync-status] latestDbMessageTs=null caughtUpToToday=${data.caughtUpToToday} isBackfilling=${backfilling} hasError=true`
      );
    }

    if (isRateLimit) {
      statusCache.set(sessionId, data, INBOX_NOCO_CACHE_MS);
    }

    return NextResponse.json(data, { headers });
  }
}
