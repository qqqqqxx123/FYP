import { NextRequest, NextResponse } from "next/server";
import { setChannelBotStatusWithProgress } from "@/lib/wooztell";
import { setBotToggleProgress } from "@/lib/wooztell-bot-progress";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/** Require X-Admin-Secret (server-to-server only). */
function requireRunAuth(request: NextRequest): boolean {
  const secret =
    process.env.ADMIN_BOT_SECRET?.trim() || process.env.ADMIN_SYNC_SECRET?.trim();
  const headerSecret =
    request.headers.get("x-admin-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!(secret && headerSecret === secret);
}

/**
 * POST /api/woztell/channel/bot/run
 * Runs the actual toggle (all members). Called by POST /api/woztell/channel/bot in a separate request
 * so the work continues even when the user navigates away. Requires x-admin-secret.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  if (!requireRunAuth(request)) {
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

  try {
    setBotToggleProgress({ targetEnabled, total: 0, updated: 0 });
    const result = await setChannelBotStatusWithProgress(
      targetEnabled,
      channelId,
      (updated, total) => {
        setBotToggleProgress({ targetEnabled, total, updated });
      }
    );
    setBotToggleProgress(null);
    return NextResponse.json(
      {
        enabled: targetEnabled,
        total: result.total,
        updated: result.updated,
        failed: result.failed,
      },
      { headers }
    );
  } catch (err) {
    setBotToggleProgress(null);
    const message = err instanceof Error ? err.message : "Failed to run bot toggle";
    console.error("[Wooztell] bot/run error:", err);
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
