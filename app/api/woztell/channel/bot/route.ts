import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getChannelBotStatus } from "@/lib/wooztell";
import {
  getBotToggleProgress,
  setBotToggleProgress,
} from "@/lib/wooztell-bot-progress";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";
const SESSION_COOKIE = "crm-session";

/** Require either valid session cookie (logged-in) or X-Admin-Secret header. */
async function requireAuth(request: NextRequest): Promise<boolean> {
  const secret = process.env.ADMIN_BOT_SECRET?.trim() || process.env.ADMIN_SYNC_SECRET?.trim();
  const headerSecret = request.headers.get("x-admin-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (secret && headerSecret === secret) return true;
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  return !!session;
}

/**
 * GET /api/woztell/channel/bot
 * Returns virtual channel bot status. When a toggle is in progress, returns inProgress + total/updated for progress bar.
 * Query: ?channelId=... (optional, else WOOZTELL_CHANNEL_ID)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);
  const channelId = request.nextUrl.searchParams.get("channelId")?.trim() || undefined;

  try {
    const progress = getBotToggleProgress();
    if (progress) {
      return NextResponse.json(
        {
          inProgress: true,
          targetEnabled: progress.targetEnabled,
          total: progress.total,
          updated: progress.updated,
        },
        { headers }
      );
    }
    const status = await getChannelBotStatus(channelId);
    return NextResponse.json(status, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get channel bot status";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}

/**
 * POST /api/woztell/channel/bot
 * Body: { channelId?: string, enabled: boolean }
 * Toggles liveChat for ALL channel members (virtual channel bot switch).
 * Requires session (logged-in) or X-Admin-Secret / Authorization: Bearer <ADMIN_BOT_SECRET>
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  const authorized = await requireAuth(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  let body: { channelId?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) is required" },
      { status: 400, headers }
    );
  }

  const channelId = body.channelId?.trim() || undefined;
  const targetEnabled = body.enabled;

  setBotToggleProgress({ targetEnabled, total: 0, updated: 0 });

  // Fire-and-forget: start the actual toggle in a separate HTTP request so it keeps running
  // when the user navigates away (no dependency on the original request).
  const secret =
    process.env.ADMIN_BOT_SECRET?.trim() || process.env.ADMIN_SYNC_SECRET?.trim();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin;
  const runUrl = `${origin}/api/woztell/channel/bot/run`;
  fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-admin-secret": secret } : {}),
    },
    body: JSON.stringify({ enabled: targetEnabled, channelId }),
  }).catch((err) => {
    console.error("[Wooztell] Failed to start bot/run:", err);
  });

  return NextResponse.json(
    { accepted: true, enabled: targetEnabled },
    { status: 202, headers }
  );
}
