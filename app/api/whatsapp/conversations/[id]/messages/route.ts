import { NextResponse } from "next/server";
import {
  isWhatsAppInboxNocoDBConfigured,
  listMessagesFromNocoDB,
} from "@/lib/whatsapp-inbox-nocodb";
import {
  createInboxKeyedCache,
  INBOX_NOCO_CACHE_MS,
  isNocoRateLimitError,
} from "@/lib/whatsapp-inbox-api-cache";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

interface MessagesPayload {
  messages: Awaited<ReturnType<typeof listMessagesFromNocoDB>>["messages"];
  pageInfo: { hasNextPage: boolean };
}

const messagesCache = createInboxKeyedCache<MessagesPayload>();

/**
 * GET /api/whatsapp/conversations/:id/messages
 * Reads messages from NocoDB Whatsapp_Message for the selected contact.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Conversation id required" }, { status: 400, headers });
    }

    if (!isWhatsAppInboxNocoDBConfigured()) {
      return NextResponse.json(
        {
          error:
            "WhatsApp inbox NocoDB is not configured. Set NOCODB_BASE_URL, NOCODB_API_TOKEN, and NOCODB_WHATSAPP_MESSAGES_TABLE_ID.",
        },
        { status: 503, headers }
      );
    }

    const { searchParams } = new URL(request.url);
    const { sessionId } = await requireWhatsAppUser({
      sessionId: searchParams.get("sessionId"),
    });
    const cacheKey = `${sessionId}:${id}`;
    const cached = messagesCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers });
    }

    const { messages } = await listMessagesFromNocoDB(id, { sessionId });
    const payload: MessagesPayload = { messages, pageInfo: { hasNextPage: false } };
    messagesCache.set(cacheKey, payload, INBOX_NOCO_CACHE_MS);
    return NextResponse.json(payload, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load messages";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: message }, { status: 401, headers });
    }
    if (message === "INVALID_SESSION") {
      return NextResponse.json({ error: "Invalid WhatsApp session" }, { status: 400, headers });
    }

    try {
      const { id } = await params;
      const { searchParams } = new URL(request.url);
      const { sessionId } = await requireWhatsAppUser({
        sessionId: searchParams.get("sessionId"),
      });
      const stale = messagesCache.getStale(`${sessionId}:${id}`);
      if (stale && isNocoRateLimitError(message)) {
        return NextResponse.json(stale, { headers });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
