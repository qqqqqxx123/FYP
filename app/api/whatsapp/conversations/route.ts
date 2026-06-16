import { NextResponse } from "next/server";
import {
  isWhatsAppInboxNocoDBConfigured,
  listConversationsFromNocoDB,
} from "@/lib/whatsapp-inbox-nocodb";
import {
  createInboxKeyedCache,
  INBOX_NOCO_CACHE_MS,
  isNocoRateLimitError,
} from "@/lib/whatsapp-inbox-api-cache";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

interface ConversationsPayload {
  conversations: Array<{
    id: string;
    name?: string;
    phone?: string;
    isGroup?: boolean;
    lastMessage?: string;
    updatedAt?: string;
  }>;
  pageInfo: { hasNextPage: boolean };
}

const conversationsCache = createInboxKeyedCache<ConversationsPayload>();

/**
 * GET /api/whatsapp/conversations
 * Reads conversations from NocoDB Whatsapp_Message (grouped by contact).
 */
export async function GET(request: Request) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  try {
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
    const cached = conversationsCache.get(sessionId);
    if (cached) {
      return NextResponse.json(cached, { headers });
    }

    const { conversations } = await listConversationsFromNocoDB({ sessionId });
    const payload: ConversationsPayload = {
      conversations: conversations.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        isGroup: c.isGroup,
        lastMessage: c.lastMessage,
        updatedAt: c.updatedAt,
      })),
      pageInfo: { hasNextPage: false },
    };

    conversationsCache.set(sessionId, payload, INBOX_NOCO_CACHE_MS);
    return NextResponse.json(payload, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load conversations";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: message }, { status: 401, headers });
    }
    if (message === "INVALID_SESSION") {
      return NextResponse.json({ error: "Invalid WhatsApp session" }, { status: 400, headers });
    }

    try {
      const { searchParams } = new URL(request.url);
      const { sessionId } = await requireWhatsAppUser({
        sessionId: searchParams.get("sessionId"),
      });
      const stale = conversationsCache.getStale(sessionId);
      if (stale && isNocoRateLimitError(message)) {
        return NextResponse.json(stale, { headers });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
