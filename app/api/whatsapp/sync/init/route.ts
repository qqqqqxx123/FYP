import { NextRequest, NextResponse } from "next/server";
import { isWhatsAppInboxNocoDBConfigured } from "@/lib/whatsapp-inbox-nocodb";
import { runFullBackfillToNocoDB } from "@/lib/whatsapp-inbox-sync";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";
const INIT_PAGE_SIZE = 100;
const INIT_MAX_PAGES = 100;

function requireAdminSyncAuth(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SYNC_SECRET?.trim();
  if (!secret) return true;
  const headerSecret = request.headers.get("x-sync-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return headerSecret === secret || bearer === secret;
}

/**
 * POST /api/whatsapp/sync/init
 * Initial backfill: paginate Wooztell conversationHistory(first=500, after=cursor), upsert into NocoDB.
 * Safety cap: INIT_MAX_PAGES pages. If ADMIN_SYNC_SECRET is set, require x-sync-secret or Authorization: Bearer <secret>.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  if (!requireAdminSyncAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  if (!isWhatsAppInboxNocoDBConfigured()) {
    return NextResponse.json(
      { error: "NocoDB WhatsApp inbox tables not configured" },
      { status: 400, headers }
    );
  }

  try {
    const result = await runFullBackfillToNocoDB({
      maxPages: INIT_MAX_PAGES,
      pageSize: INIT_PAGE_SIZE,
    });
    return NextResponse.json(
      {
        success: true,
        pages: result.pages,
        processed: result.processed,
        capped: result.capped,
        endCursor: result.endCursor,
      },
      { headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync init failed";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
