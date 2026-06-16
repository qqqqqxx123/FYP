import { NextRequest, NextResponse } from "next/server";
import {
  fetchConversationHistoryPage,
  getContacts,
  getMemberDisplayName,
  parseMessageEvent,
} from "@/lib/wooztell";
import {
  isWhatsAppInboxNocoDBConfigured,
  upsertConversationToNocoDB,
  upsertMessageToNocoDB,
  getSyncState,
  setSyncState,
} from "@/lib/whatsapp-inbox-nocodb";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";
const INCREMENTAL_PAGE_SIZE = 100;

function requireAdminSyncAuth(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SYNC_SECRET?.trim();
  if (!secret) return true;
  const headerSecret = request.headers.get("x-sync-secret");
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return headerSecret === secret || bearer === secret;
}

/**
 * POST /api/whatsapp/sync/incremental
 * Fetch new events since last_cursor, upsert messages and conversation metadata, advance cursor.
 * If ADMIN_SYNC_SECRET is set, require x-sync-secret or Authorization: Bearer <secret>.
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
    const { lastCursor } = await getSyncState();
    const contacts = await getContacts().catch(() => ({ contacts: {} as Record<string, string> }));
    const contactsMap = contacts.contacts ?? {};
    const nameCache = new Map<string, string | null>();

    const page = await fetchConversationHistoryPage({
      first: INCREMENTAL_PAGE_SIZE,
      after: lastCursor ?? undefined,
    });
    const edges = page.edges ?? [];
    let processed = 0;

    for (const edge of edges) {
      const raw = edge?.node?.messageEvent;
      const parsed = parseMessageEvent(
        raw,
        edge?.node?.id,
        edge?.cursor,
        contactsMap
      );
      if (!parsed) continue;

      const phoneKey = (parsed.otherPhone ?? "").replace(/\D/g, "") || "";
      let displayName = nameCache.get(phoneKey);
      if (displayName === undefined) {
        displayName = await getMemberDisplayName(parsed.otherPhone ?? "").catch(() => null);
        nameCache.set(phoneKey, displayName);
      }
      const nameForNoco = (displayName ?? parsed.name ?? "").trim() || undefined;

      await upsertConversationToNocoDB({
        Conversation_Id: parsed.conversationId,
        Whatsapp_number: parsed.otherPhone,
        Name: nameForNoco,
        Last_Message: parsed.lastMessage,
        Updated_Time: parsed.updatedTime,
      }).catch(() => {});

      await upsertMessageToNocoDB({
        Message_Id: parsed.messageId,
        Conversation_Id: parsed.conversationId,
        Text: parsed.text,
        From_Me: parsed.fromMe,
        Created_Time: parsed.updatedTime,
      }).catch(() => {});
      processed++;
    }

    const nextCursor = page.pageInfo?.endCursor ?? lastCursor;
    await setSyncState({
      Last_Cursor: nextCursor,
      Last_Synced_At: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        processed,
        endCursor: nextCursor,
      },
      { headers }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync incremental failed";
    return NextResponse.json({ error: message }, { status: 500, headers });
  }
}
