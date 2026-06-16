import { NextResponse } from "next/server";
import { getContacts } from "@/lib/wooztell";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/**
 * GET /api/whatsapp/contacts
 * Returns phone (normalized) -> display name from Wooztell members API.
 * Used to enrich conversation list with names. Falls back to empty map if API unsupported.
 */
export async function GET() {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  try {
    const result = await getContacts();
    return NextResponse.json(result, { headers });
  } catch (err) {
    return NextResponse.json({ contacts: {} }, { headers });
  }
}
