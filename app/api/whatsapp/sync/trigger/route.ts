import { NextRequest, NextResponse } from "next/server";
import { isWhatsAppInboxNocoDBConfigured } from "@/lib/whatsapp-inbox-nocodb";
import { setBackfilling } from "@/lib/whatsapp-backfill-progress";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/**
 * POST /api/whatsapp/sync/trigger
 * Starts full backfill in a separate request (fire-and-forget). Returns 202 immediately.
 * The run request runs in the same process so Stop button (abort flag) can work.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  if (!isWhatsAppInboxNocoDBConfigured()) {
    return NextResponse.json(
      { error: "NocoDB WhatsApp inbox tables not configured" },
      { status: 400, headers }
    );
  }

  setBackfilling(true);

  const secret = process.env.ADMIN_SYNC_SECRET?.trim();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin;
  const runUrl = `${origin}/api/whatsapp/sync/run`;
  fetch(runUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-sync-secret": secret } : {}),
    },
    body: JSON.stringify({}),
  }).catch(() => {
    setBackfilling(false);
  });

  return NextResponse.json({ ok: true, message: "Sync started" }, { status: 202, headers });
}
