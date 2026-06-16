/**
 * Full backfill from Wooztell conversationHistory into NocoDB.
 * Paginates conversationHistory(first, after), upserts every message + conversation.
 */

import {
  fetchConversationHistoryPage,
  getContacts,
  getMemberDisplayNamesForChannel,
  getMessages,
  listConversations,
  parseMessageEvent,
} from "@/lib/wooztell";
import {
  upsertConversationToNocoDB,
  upsertMessageToNocoDB,
  setSyncState,
} from "@/lib/whatsapp-inbox-nocodb";
import { setBackfilling, isAbortRequested, clearAbortRequested } from "@/lib/whatsapp-backfill-progress";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 100;

/**
 * Fallback when conversationHistory pagination returns 0 edges (e.g. schema mismatch).
 * Uses listConversations + getMessages per conversation to seed NocoDB.
 */
async function fallbackSeedFromListConversations(): Promise<void> {
  const convResult = await listConversations({ first: 100 });
  const convs = convResult.conversations ?? [];
  for (const c of convs) {
    await upsertConversationToNocoDB({
      Conversation_Id: c.id,
      Whatsapp_number: c.phone,
      Name: c.name,
      Last_Message: c.lastMessage,
      Updated_Time: c.updatedAt ?? "",
    }).catch(() => {});
    const msgResult = await getMessages(c.id, { first: 100 });
    for (const m of msgResult.messages ?? []) {
      await upsertMessageToNocoDB({
        Message_Id: m.id,
        Conversation_Id: c.id,
        Text: m.text,
        From_Me: m.fromMe,
        Created_Time: m.createdAt ?? "",
      }).catch(() => {});
    }
  }
}

export interface FullBackfillResult {
  pages: number;
  processed: number;
  endCursor: string | null;
  capped: boolean;
}

/**
 * Run full backfill: paginate Wooztell conversationHistory until done (or maxPages).
 * Upserts every message event into WhatsApp_Conversations and WhatsApp_Messages.
 * Updates WhatsApp_SyncState with last cursor.
 */
export async function runFullBackfillToNocoDB(options?: {
  maxPages?: number;
  pageSize?: number;
}): Promise<FullBackfillResult> {
  clearAbortRequested();
  setBackfilling(true);
  try {
    return await runFullBackfillToNocoDBInner(options);
  } finally {
    setBackfilling(false);
  }
}

async function runFullBackfillToNocoDBInner(options?: {
  maxPages?: number;
  pageSize?: number;
}): Promise<FullBackfillResult> {
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const pageSize = Math.min(options?.pageSize ?? DEFAULT_PAGE_SIZE, 100);

  const contacts = await getContacts().catch(() => ({ contacts: {} as Record<string, string> }));
  const contactsMap = contacts.contacts ?? {};
  /** Cache Wooztell member display name by normalized phone; pre-fill from one batch request to avoid "Too Many Request". */
  const nameCache = new Map<string, string | null>();
  const namesMap = await getMemberDisplayNamesForChannel().catch(() => ({}));
  for (const [phone, name] of Object.entries(namesMap)) {
    if (name) nameCache.set(phone, name);
  }
  let cursor: string | null = null;
  let pageCount = 0;
  let totalProcessed = 0;

  while (pageCount < maxPages) {
    if (isAbortRequested()) break;
    const page = await fetchConversationHistoryPage({
      first: pageSize,
      after: cursor,
    });
    const edges = page.edges ?? [];
    if (edges.length === 0) {
      if (pageCount === 0 && totalProcessed === 0) {
        await fallbackSeedFromListConversations();
      }
      break;
    }

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
      const displayName = nameCache.get(phoneKey) ?? null;
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
      totalProcessed++;
    }

    pageCount++;
    const nextCursor = page.pageInfo?.endCursor ?? null;
    if (!page.pageInfo?.hasNextPage || !nextCursor) {
      await setSyncState({
        Last_Cursor: nextCursor,
        Last_Synced_At: new Date().toISOString(),
      }).catch(() => {});
      return { pages: pageCount, processed: totalProcessed, endCursor: nextCursor, capped: false };
    }
    cursor = nextCursor;
  }

  await setSyncState({
    Last_Cursor: cursor,
    Last_Synced_At: new Date().toISOString(),
  }).catch(() => {});

  return { pages: pageCount, processed: totalProcessed, endCursor: cursor, capped: true };
}
