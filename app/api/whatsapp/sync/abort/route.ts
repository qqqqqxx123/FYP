import { NextResponse } from "next/server";
import { setAbortRequested } from "@/lib/whatsapp-backfill-progress";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/**
 * POST /api/whatsapp/sync/abort
 * Requests the running backfill to stop. The backfill checks this flag each page
 * and exits early when set. In-memory only; works when backfill runs in same process.
 */
export async function POST() {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);
  setAbortRequested();
  return NextResponse.json({ ok: true }, { headers });
}
