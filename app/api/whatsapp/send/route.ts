import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/wooztell";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/**
 * POST /api/whatsapp/send
 * Body: { conversationId?: string, to?: string, text: string }
 * Server-only: proxies to Wooztell Bot API. No DB, no logging of content/phones.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers });
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : undefined;
    const to = typeof body.to === "string" ? body.to.trim() : undefined;
    const text = typeof body.text === "string" ? body.text : "";

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400, headers });
    }
    if (!conversationId && !to) {
      return NextResponse.json({ error: "conversationId or to (phone) is required" }, { status: 400, headers });
    }

    const result = await sendMessage({ conversationId, to, text });
    return NextResponse.json(result, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
