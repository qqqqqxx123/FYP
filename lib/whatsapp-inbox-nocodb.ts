import {
  AI_SCAM_DETECT_AGENT_DISPLAY_NAME,
  AI_SCAM_DETECT_AGENT_PHONE_DIGITS,
  isAiScamDetectAgentContact,
  isSameWhatsAppPhone,
} from "@/lib/whatsapp-phone";
import { isNocoRateLimitError } from "@/lib/whatsapp-inbox-api-cache";

/**
 * NocoDB helpers for WhatsApp Inbox cache.
 * Tables: WhatsApp_Conversations (Conversation_Id, Name, Whatsapp_number, Last_Message, Updated_Time, Synced_At),
 *         Whatsapp_Message (From, To, Message_id, Message_type, Message, Scam_percentage,
 *         Scam_percentage_description, Media_url, Mime_type, File_name, Direction, timestamp,
 *         session_id, Push_name, Contact_name, Is_group, Chat_name),
 *         WhatsApp_SyncState (Sync_Key, Last_Cursor, Last_Synced_At) - single row key "default".
 */

const getBaseUrl = () => {
  const url = process.env.NOCODB_BASE_URL;
  if (!url) throw new Error("NOCODB_BASE_URL is not set");
  return url.replace(/\/$/, "");
};

const getToken = () => {
  const token =
    process.env.NOCODB_API_TOKEN?.trim() ||
    process.env.NOCODB_XC_TOKEN?.trim();
  if (!token) throw new Error("NOCODB_API_TOKEN or NOCODB_XC_TOKEN is not set");
  return token;
};

const baseId = () => process.env.NOCODB_BASE_ID;

const messagesTableCandidatesPromise: { current: Promise<string[]> | null } = { current: null };
const conversationsTableCandidatesPromise: { current: Promise<string[]> | null } = { current: null };
const syncTableCandidatesPromise: { current: Promise<string[]> | null } = { current: null };

/** NocoDB record APIs need table ids (e.g. mn010qeqmsne1om), not view ids or display names. */
function isNocoTableId(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith("vw")) return false;
  return /^[a-z0-9]{10,24}$/i.test(trimmed);
}

async function resolveNocoTableCandidates(
  configured: string | undefined,
  matchTitle?: (normalizedTitle: string) => boolean
): Promise<string[]> {
  const resolved: string[] = [];
  const bid = baseId();

  if (configured && isNocoTableId(configured)) {
    resolved.push(configured);
  }

  if (bid) {
    try {
      const res = await fetch(`${getBaseUrl()}/api/v2/meta/bases/${bid}/tables`, {
        headers: headers(),
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          list?: Array<{ id?: string; table_name?: string; title?: string }>;
        };
        const tables = data.list ?? [];

        if (configured?.toLowerCase().startsWith("vw")) {
          for (const table of tables) {
            if (!table.id) continue;
            try {
              const viewRes = await fetch(`${getBaseUrl()}/api/v2/meta/tables/${table.id}/views`, {
                headers: headers(),
                cache: "no-store",
              });
              if (!viewRes.ok) continue;
              const viewData = (await viewRes.json()) as {
                list?: Array<{ id?: string; fk_model_id?: string; fk_modelId?: string }>;
              };
              const matchedView = (viewData.list ?? []).find(
                (view) => String(view.id ?? "").trim() === configured
              );
              if (!matchedView) continue;
              const modelId = String(
                matchedView.fk_model_id ?? matchedView.fk_modelId ?? table.id
              ).trim();
              if (isNocoTableId(modelId)) resolved.unshift(modelId);
              else if (table.id && isNocoTableId(table.id)) resolved.unshift(table.id);
              break;
            } catch {
              continue;
            }
          }
        }

        if (matchTitle) {
          for (const table of tables) {
            const title = String(table.title ?? table.table_name ?? "").toLowerCase();
            if (!matchTitle(title)) continue;
            if (table.id && isNocoTableId(table.id)) resolved.push(table.id);
          }
        }
      }
    } catch {
      // metadata discovery is optional
    }
  }

  return [...new Set(resolved.filter(Boolean))];
}

async function getCachedTableCandidates(
  cache: { current: Promise<string[]> | null },
  configured: string | undefined,
  matchTitle?: (normalizedTitle: string) => boolean,
  label = "table"
): Promise<string[]> {
  if (cache.current) return cache.current;

  cache.current = resolveNocoTableCandidates(configured, matchTitle).then((candidates) => {
    if (candidates.length === 0) {
      cache.current = null;
      throw new Error(
        `No valid NocoDB ${label} id found. Set the env var to the table id (not the view id), e.g. mn010qeqmsne1om.`
      );
    }
    return candidates;
  });

  return cache.current;
}

function getMessagesTableCandidates(): Promise<string[]> {
  return getCachedTableCandidates(
    messagesTableCandidatesPromise,
    process.env.NOCODB_WHATSAPP_MESSAGES_TABLE_ID?.trim(),
    (title) =>
      title === "whatsapp_message" ||
      title === "whatsapp_messages" ||
      (title.includes("whatsapp") && title.includes("message") && !title.includes("craw")),
    "Whatsapp_Message"
  );
}

function getConversationsTableCandidates(): Promise<string[]> {
  return getCachedTableCandidates(
    conversationsTableCandidatesPromise,
    process.env.NOCODB_WHATSAPP_CONVERSATIONS_TABLE_ID?.trim(),
    (title) => title.includes("whatsapp") && title.includes("conversation"),
    "WhatsApp_Conversations"
  );
}

function getSyncTableCandidates(): Promise<string[]> {
  return getCachedTableCandidates(
    syncTableCandidatesPromise,
    process.env.NOCODB_WHATSAPP_SYNC_STATE_TABLE_ID?.trim(),
    (title) => title.includes("sync"),
    "WhatsApp_SyncState"
  );
}

function recordPathsForTable(tableId: string, query: string): string[] {
  const baseUrl = getBaseUrl();
  const bid = baseId();
  const encodedTable = encodeURIComponent(tableId);
  const paths = [`${baseUrl}/api/v2/tables/${encodedTable}/records?${query}`];
  if (bid) {
    paths.push(`${baseUrl}/api/v1/db/data/noco/${bid}/${encodedTable}?${query}`);
  }
  return paths;
}

function recordMutationPathsForTable(
  tableId: string,
  rowId?: string
): { post: string[]; patch?: string[] } {
  const baseUrl = getBaseUrl();
  const bid = baseId();
  const encodedTable = encodeURIComponent(tableId);
  const post = [`${baseUrl}/api/v2/tables/${encodedTable}/records`];
  const patch =
    rowId != null
      ? [`${baseUrl}/api/v2/tables/${encodedTable}/records/${encodeURIComponent(String(rowId))}`]
      : undefined;
  if (bid) {
    post.push(`${baseUrl}/api/v1/db/data/noco/${bid}/${encodedTable}`);
    if (rowId != null) {
      patch?.push(`${baseUrl}/api/v1/db/data/noco/${bid}/${encodedTable}/${rowId}`);
    }
  }
  return { post, patch };
}

function recordDeletePathsForTable(tableId: string): string[] {
  const baseUrl = getBaseUrl();
  const bid = baseId();
  const encodedTable = encodeURIComponent(tableId);
  const paths = [`${baseUrl}/api/v2/tables/${encodedTable}/records`];
  if (bid) {
    paths.push(`${baseUrl}/api/v1/db/data/noco/${bid}/${encodedTable}`);
  }
  return paths;
}

async function deleteNocoRecordsBatch(
  tableId: string,
  recordIds: Array<string | number>
): Promise<boolean> {
  if (recordIds.length === 0) return true;

  const body = JSON.stringify(recordIds.map((id) => ({ Id: id })));
  const fetchOpts = {
    method: "DELETE" as const,
    headers: headers(),
    body,
    cache: "no-store" as RequestCache,
  };

  for (const path of recordDeletePathsForTable(tableId)) {
    const res = await fetch(path, fetchOpts);
    if (res.ok) return true;
  }

  return false;
}

async function fetchFirstOkRecordResponse(
  tableCandidates: string[],
  query: string,
  preferredTableId?: string
): Promise<Response> {
  const fetchOpts = { headers: headers(), cache: "no-store" as RequestCache };
  const ordered =
    preferredTableId && tableCandidates.includes(preferredTableId)
      ? [preferredTableId, ...tableCandidates.filter((id) => id !== preferredTableId)]
      : tableCandidates;

  if (ordered.length === 0) {
    throw new Error(
      "Failed to fetch NocoDB records: no valid table id configured. Set NOCODB_WHATSAPP_MESSAGES_TABLE_ID to mn010qeqmsne1om."
    );
  }

  let lastStatus = 0;
  let lastBody = "";

  for (const tableId of ordered) {
    for (const path of recordPathsForTable(tableId, query)) {
      const res = await nocoRecordFetch(path, fetchOpts);
      if (res.ok) return res;
      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");
    }
  }

  throw new Error(
    `Failed to fetch NocoDB records: ${lastStatus} ${lastBody.slice(0, 160)}`
  );
}

async function postFirstOk(
  tableCandidates: string[],
  body: unknown
): Promise<Response> {
  const fetchOpts = {
    method: "POST" as const,
    headers: headers(),
    body: JSON.stringify(body),
  };

  for (const tableId of tableCandidates) {
    for (const path of recordMutationPathsForTable(tableId).post) {
      const res = await fetch(path, fetchOpts);
      if (res.ok) return res;
    }
  }

  throw new Error("Failed to create record in NocoDB");
}

async function patchFirstOk(
  tableCandidates: string[],
  rowId: string | number,
  body: unknown
): Promise<void> {
  const fetchOpts = {
    method: "PATCH" as const,
    headers: headers(),
    body: JSON.stringify(body),
  };

  for (const tableId of tableCandidates) {
    for (const path of recordMutationPathsForTable(tableId, rowId).patch ?? []) {
      const res = await fetch(path, fetchOpts);
      if (res.ok) return;
    }
  }

  throw new Error("Failed to update record in NocoDB");
}

function headers() {
  return {
    "xc-token": getToken(),
    "Content-Type": "application/json",
  };
}

export interface WhatsAppConversationRow {
  Id?: number;
  Conversation_Id?: string;
  Name?: string;
  Whatsapp_number?: string;
  Last_Message?: string;
  Updated_Time?: string;
  Synced_At?: string;
  [key: string]: unknown;
}

export interface WhatsAppMessageRow {
  Id?: number;
  Message_Id?: string;
  Conversation_Id?: string;
  Text?: string;
  From_Me?: boolean;
  Created_Time?: string;
  Synced_At?: string;
  [key: string]: unknown;
}

export interface SyncStateRow {
  Id?: number;
  Sync_Key?: string;
  Last_Cursor?: string;
  Last_Synced_At?: string;
  [key: string]: unknown;
}

/** Check if NocoDB Whatsapp_Message table is configured. */
export function isWhatsAppInboxNocoDBConfigured(): boolean {
  return !!(
    process.env.NOCODB_BASE_URL &&
    (process.env.NOCODB_API_TOKEN?.trim() || process.env.NOCODB_XC_TOKEN?.trim()) &&
    process.env.NOCODB_WHATSAPP_MESSAGES_TABLE_ID?.trim()
  );
}

interface ListInboxOptions {
  sessionId?: string;
  fromContact?: string;
}

/** NocoDB v2 where clauses use unquoted values: (col,eq,value) */
function escapeNocoWhereValue(value: string): string {
  return value.replace(/,/g, "\\,");
}

function getRowString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }

  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedKeys.has(key.toLowerCase())) continue;
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

function normalizeFromMe(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "y" || normalized === "yes";
  }
  return false;
}

function isGroupMessageRow(row: Record<string, unknown>): boolean {
  const flag = row.Is_group ?? row.is_group;
  if (flag === true || flag === 1) return true;
  if (typeof flag === "string") {
    const normalized = flag.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function extractGroupJidKey(value: string): string | null {
  const trimmed = value.replace(/^'+/, "").trim();
  if (!trimmed) return null;
  const beforeAt = trimmed.split("@")[0] ?? trimmed;
  if (/^\d+-\d+/.test(beforeAt)) return beforeAt;
  return null;
}

function getGroupConversationKey(row: Record<string, unknown>): string | null {
  if (!isGroupMessageRow(row)) return null;
  for (const field of ["From", "from", "To", "to"]) {
    const raw = getRowString(row, field);
    const key = extractGroupJidKey(raw);
    if (key) return key;
  }
  return null;
}

function getGroupChatName(row: Record<string, unknown>): string {
  return getRowString(row, "Chat_name", "chat_name").replace(/^'+/, "").trim();
}

function getMessageSenderName(row: Record<string, unknown>): string | undefined {
  if (!isGroupMessageRow(row) || getMessageFromMe(row)) return undefined;
  const senderName =
    getRowString(row, "Contact_name", "contact_name") ||
    getRowString(row, "Push_name", "push_name");
  return senderName || undefined;
}

function stripWhatsAppJid(value: string): string {
  return value.replace(/^'+/, "").trim().split("@")[0] ?? "";
}

/** Extract stable digits from phone, LID (`digits@lid`), or messy values like `49344896073791, me 2`. */
function extractWhatsAppPeerDigits(value: string): string {
  const trimmed = String(value ?? "").replace(/^'+/, "").trim();
  if (!trimmed) return "";

  const jidMatch = trimmed.match(/^(\d{8,})@/);
  if (jidMatch) return jidMatch[1];

  const leadingMatch = trimmed.match(/^(\d{8,})/);
  if (leadingMatch) return leadingMatch[1];

  return normalizePhoneDigits(trimmed);
}

function isSameWhatsAppPeer(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (isSameWhatsAppPhone(left, right)) return true;

  const leftDigits = extractWhatsAppPeerDigits(String(left ?? ""));
  const rightDigits = extractWhatsAppPeerDigits(String(right ?? ""));
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits) return true;

  const shorter = leftDigits.length <= rightDigits.length ? leftDigits : rightDigits;
  const longer = leftDigits.length > rightDigits.length ? leftDigits : rightDigits;
  return shorter.length >= 10 && longer.startsWith(shorter);
}

function getMessageFromMe(row: Record<string, unknown>): boolean {
  const direction = getRowString(row, "Direction", "direction").toUpperCase();
  return direction === "OUTBOUND" || normalizeFromMe(row.From_Me ?? row.from_me);
}

/** Resolve the other party in a 1:1 thread (contact for inbound From, recipient for outbound To). */
function getMessagePeerRaw(row: Record<string, unknown>): string {
  const fromMe = getMessageFromMe(row);
  const from = getRowString(row, "From", "from");
  const to = getRowString(row, "To", "to");
  const chatName = getRowString(row, "Chat_name", "chat_name");

  if (fromMe) {
    const toDigits = extractWhatsAppPeerDigits(to);
    if (toDigits.length >= 8) return toDigits;
    const chatDigits = extractWhatsAppPeerDigits(chatName);
    if (chatDigits.length >= 8) return chatDigits;
    return stripWhatsAppJid(to) || stripWhatsAppJid(from);
  }

  const fromDigits = extractWhatsAppPeerDigits(from);
  if (fromDigits.length >= 8) return fromDigits;
  const chatDigits = extractWhatsAppPeerDigits(chatName);
  if (chatDigits.length >= 8) return chatDigits;
  return stripWhatsAppJid(from) || stripWhatsAppJid(to) || chatName.replace(/^'+/, "").trim();
}

function isScamAlertMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return (
    trimmed.includes("詐騙警告") ||
    trimmed.includes("Scam Warning") ||
    trimmed.includes("OpenClaw AI") ||
    trimmed.includes("OpenClaw")
  );
}

/** Canonical conversation key — same WhatsApp number merges inbound/outbound into one thread. */
function getConversationGroupKey(row: Record<string, unknown>): string {
  const from = stripWhatsAppJid(getRowString(row, "From", "from"));
  const to = stripWhatsAppJid(getRowString(row, "To", "to"));
  const chatName = getRowString(row, "Chat_name", "chat_name").replace(/^'+/, "").trim();
  const messageText = getRowString(row, "Message", "message", "Text", "text");

  const isAgentThread =
    isAiScamDetectAgentContact(from) ||
    isAiScamDetectAgentContact(to) ||
    isAiScamDetectAgentContact(chatName) ||
    isScamAlertMessage(messageText) ||
    (getMessageFromMe(row) && isAiScamDetectAgentContact(chatName));

  if (isAgentThread) {
    return AI_SCAM_DETECT_AGENT_PHONE_DIGITS;
  }

  const groupKey = getGroupConversationKey(row);
  if (groupKey) return groupKey;

  const peer = getMessagePeerRaw(row);
  if (!peer) return "";
  const digits = extractWhatsAppPeerDigits(peer);
  if (digits.length >= 8) return digits;
  return peer;
}

function collectContactIdVariants(contactKey: string): string[] {
  const trimmed = contactKey.replace(/^'+/, "").trim();
  const stripped = stripWhatsAppJid(trimmed);
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (stripped) variants.add(stripped);
  const digits = extractWhatsAppPeerDigits(stripped || trimmed);
  if (digits.length >= 8) {
    variants.add(digits);
    variants.add(`+${digits}`);
    variants.add(`${digits}@s.whatsapp.net`);
    variants.add(`${digits}@lid`);
  }
  return [...variants];
}

function buildContactMatchWhereClause(contactKey: string): string {
  const parts = collectContactIdVariants(contactKey).flatMap((variant) => {
    const escaped = escapeNocoWhereValue(variant);
    return [`(From,eq,${escaped})`, `(To,eq,${escaped})`];
  });
  if (parts.length === 0) return `(From,eq,${escapeNocoWhereValue(contactKey)})`;
  if (parts.length === 1) return parts[0];
  return `(${parts.join("~or")})`;
}

function rowMatchesConversationKey(
  row: Record<string, unknown>,
  conversationKey: string
): boolean {
  const rowGroupKey = getGroupConversationKey(row);
  if (rowGroupKey && rowGroupKey === conversationKey) return true;

  const peerKey = getConversationGroupKey(row);
  if (peerKey && isSameWhatsAppPeer(peerKey, conversationKey)) return true;

  for (const field of ["From", "from", "To", "to", "Chat_name", "chat_name"]) {
    const raw = getRowString(row, field);
    if (!raw) continue;
    if (extractGroupJidKey(raw) === conversationKey) return true;
    if (isSameWhatsAppPeer(raw, conversationKey)) return true;
  }

  const rowPhone = resolveConversationPhone(row, peerKey);
  return isSameWhatsAppPeer(rowPhone, conversationKey);
}

interface ConversationGroup {
  id: string;
  name?: string;
  phone?: string;
  isGroup?: boolean;
  lastMessage?: string;
  updatedAt?: string;
  updatedAtMs: number;
}

function getConversationMergeKey(conv: ConversationGroup): string {
  if (conv.isGroup) return conv.id;
  const phoneDigits = extractWhatsAppPeerDigits(conv.phone ?? "");
  if (phoneDigits.length >= 8) return phoneDigits;
  const idDigits = extractWhatsAppPeerDigits(conv.id);
  if (idDigits.length >= 8) return idDigits;
  return conv.id;
}

function pickBetterDisplayName(current?: string, candidate?: string): string | undefined {
  if (candidate && !looksLikeWhatsAppNumber(candidate)) return candidate;
  if (current && !looksLikeWhatsAppNumber(current)) return current;
  return candidate || current;
}

function pickBetterPhone(
  current?: string,
  candidate?: string,
  mergeKey?: string
): string | undefined {
  if (current && looksLikeWhatsAppNumber(current)) return current;
  if (candidate && looksLikeWhatsAppNumber(candidate)) return candidate;
  if (mergeKey && looksLikeWhatsAppNumber(mergeKey)) return mergeKey;
  return candidate || current;
}

function mergeConversationsByPhone(groups: ConversationGroup[]): ConversationGroup[] {
  const merged = new Map<string, ConversationGroup>();

  for (const conv of groups) {
    const mergeKey = getConversationMergeKey(conv);
    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, { ...conv, id: mergeKey });
      continue;
    }

    const newer = conv.updatedAtMs >= existing.updatedAtMs ? conv : existing;
    const older = newer === conv ? existing : conv;
    merged.set(mergeKey, {
      id: mergeKey,
      name: pickBetterDisplayName(newer.name, older.name),
      phone: pickBetterPhone(newer.phone, older.phone, mergeKey),
      lastMessage: newer.lastMessage ?? older.lastMessage,
      updatedAt: newer.updatedAt ?? older.updatedAt,
      updatedAtMs: Math.max(conv.updatedAtMs, existing.updatedAtMs),
    });
  }

  return [...merged.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

function parseMessageTimestamp(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && asNumber > 0) return asNumber < 1e12 ? asNumber * 1000 : asNumber;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildInboxWhereClause(options?: ListInboxOptions): string | undefined {
  const filters: string[] = [];
  if (options?.sessionId) {
    filters.push(`(session_id,eq,${escapeNocoWhereValue(options.sessionId)})`);
  }
  if (options?.fromContact) {
    filters.push(buildContactMatchWhereClause(options.fromContact));
  }
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return filters.join("~and");
}

const MESSAGES_PAGE_SIZE = 100;
const MESSAGES_MAX_PAGES = 50;

const inboxRowsInflight = new Map<string, Promise<Record<string, unknown>[]>>();

function inboxRowsCacheKey(options?: ListInboxOptions): string {
  return `${options?.sessionId ?? ""}|${options?.fromContact ?? ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function nocoRecordFetch(path: string, fetchOpts: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(path, fetchOpts);
    if (res.ok) return res;
    const body = await res.text().catch(() => "");
    if (attempt < 2 && isNocoRateLimitError(body)) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    return new Response(body, { status: res.status, statusText: res.statusText });
  }
  throw new Error("Failed to fetch NocoDB records");
}

async function fetchInboxMessageRows(options?: ListInboxOptions): Promise<Record<string, unknown>[]> {
  const key = inboxRowsCacheKey(options);
  const inflight = inboxRowsInflight.get(key);
  if (inflight) return inflight;

  const promise = fetchInboxMessageRowsPaged(options).finally(() => {
    inboxRowsInflight.delete(key);
  });
  inboxRowsInflight.set(key, promise);
  return promise;
}

async function fetchInboxMessageRowsPaged(
  options?: ListInboxOptions
): Promise<Record<string, unknown>[]> {
  const tableCandidates = await getMessagesTableCandidates();
  const fetchOpts = { headers: headers(), cache: "no-store" as RequestCache };
  const where = buildInboxWhereClause(options);
  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let workingTableId: string | undefined;

  for (let page = 0; page < MESSAGES_MAX_PAGES; page++) {
    const whereQuery = where ? `&where=${encodeURIComponent(where)}` : "";
    const query = `limit=${MESSAGES_PAGE_SIZE}&offset=${offset}${whereQuery}`;
    let res: Response | null = null;
    let lastError = "";

    const ordered =
      workingTableId && tableCandidates.includes(workingTableId)
        ? [workingTableId]
        : tableCandidates;

    for (const tableId of ordered) {
      for (const path of recordPathsForTable(tableId, query)) {
        const attempt = await nocoRecordFetch(path, fetchOpts);
        if (attempt.ok) {
          res = attempt;
          workingTableId = tableId;
          break;
        }
        lastError = await attempt.text().catch(() => "");
      }
      if (res) break;
    }

    if (!res) {
      throw new Error(
        `Failed to fetch Whatsapp_Message from NocoDB: ${lastError.slice(0, 160)}`
      );
    }

    const data = (await res.json()) as {
      list?: Record<string, unknown>[];
      data?: Record<string, unknown>[];
      records?: Record<string, unknown>[];
    };
    const list = data?.list ?? data?.data ?? data?.records ?? [];
    allRows.push(...list);
    if (list.length < MESSAGES_PAGE_SIZE) break;
    offset += list.length;
  }

  return allRows;
}

function pickBetterGroupName(current?: string, candidate?: string): string | undefined {
  if (candidate && !looksLikeWhatsAppNumber(candidate)) return candidate;
  if (current && !looksLikeWhatsAppNumber(current)) return current;
  return candidate || current;
}

function getConversationDisplayName(row: Record<string, unknown>, fallback: string): string {
  if (isGroupMessageRow(row)) {
    const chatName = getGroupChatName(row);
    if (chatName && !looksLikeWhatsAppNumber(chatName)) return chatName;
    return fallback;
  }
  return getContactDisplayName(row, fallback);
}

function getContactDisplayName(row: Record<string, unknown>, fallback: string): string {
  return (
    getRowString(row, "Contact_name", "contact_name") ||
    getRowString(row, "Push_name", "push_name") ||
    getRowString(row, "Chat_name", "chat_name").replace(/^'+/, "").trim() ||
    fallback
  );
}

function looksLikeWhatsAppNumber(value: string): boolean {
  const trimmed = value.replace(/^'+/, "").trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && (trimmed.startsWith("+") || /^\d[\d\s-]+$/.test(trimmed));
}

function getContactPhoneFromRow(row: Record<string, unknown>, contactId: string): string {
  const chatName = getRowString(row, "Chat_name", "chat_name").replace(/^'+/, "").trim();
  if (looksLikeWhatsAppNumber(chatName)) return chatName;

  const contactName = getRowString(row, "Contact_name", "contact_name");
  if (looksLikeWhatsAppNumber(contactName)) return contactName.trim();

  if (looksLikeWhatsAppNumber(contactId)) return contactId;

  return chatName || contactId;
}

function resolveConversationPhone(
  row: Record<string, unknown>,
  contactId: string,
  existingPhone?: string
): string {
  const candidate = getContactPhoneFromRow(row, contactId);
  if (looksLikeWhatsAppNumber(candidate)) return candidate;
  if (existingPhone && looksLikeWhatsAppNumber(existingPhone)) return existingPhone;
  return candidate || existingPhone || contactId;
}

function formatWhatsappMessageText(row: Record<string, unknown>): string | undefined {
  const messageType = getRowString(row, "Message_type", "message_type").toLowerCase();
  const body = getRowString(row, "Message", "message", "Text", "text");
  const mediaUrl = getRowString(row, "Media_url", "media_url");

  if (messageType === "image") return mediaUrl ? `[image] ${mediaUrl}` : "[image]";
  if (messageType === "ptt") return "[voice message]";
  if (messageType === "location") return "[location]";
  if (messageType && messageType !== "chat" && !body) return `[${messageType}]`;

  return body || undefined;
}

function getScamFields(row: Record<string, unknown>): {
  scamPercentage?: number;
  scamDescription?: string;
} {
  const scamPctRaw = getRowString(row, "Scam_percentage", "scam_percentage");
  const scamPct = scamPctRaw ? Number(scamPctRaw) : NaN;
  if (Number.isNaN(scamPct) || scamPct <= 0) return {};

  const scamDesc = getRowString(
    row,
    "Scam_percentage_description",
    "scam_percentage_description"
  );

  return {
    scamPercentage: scamPct,
    scamDescription: scamDesc || undefined,
  };
}

function mapWhatsappMessageRow(
  row: Record<string, unknown>,
  conversationId: string
): {
  id: string;
  conversationId: string;
  text?: string;
  fromMe?: boolean;
  createdAt?: string;
  scamPercentage?: number;
  scamDescription?: string;
  senderName?: string;
  rawTimeMs: number;
} | null {
  const messageId = getRowString(row, "Message_id", "Message_Id", "message_id");
  const rowId = getRowString(row, "Id", "id");
  const id = messageId || (rowId ? `row:${rowId}` : "");
  if (!id) return null;

  const text = formatWhatsappMessageText(row);

  const fromMe = getMessageFromMe(row);

  const rawTime = getRowString(row, "timestamp", "CreatedAt", "Created_Time", "created_at");
  const rawTimeMs = rawTime ? parseMessageTimestamp(rawTime) ?? 0 : 0;
  const createdAt = rawTimeMs > 0 ? String(rawTimeMs) : rawTime || undefined;

  const scam = getScamFields(row);

  return {
    id,
    conversationId: getRowString(row, "From", "from") || conversationId,
    text,
    fromMe,
    createdAt,
    scamPercentage: scam.scamPercentage,
    scamDescription: scam.scamDescription,
    senderName: getMessageSenderName(row),
    rawTimeMs,
  };
}

/** Build conversation list from Whatsapp_Message rows (grouped by contact phone / jid). */
export async function listConversationsFromNocoDB(options?: ListInboxOptions): Promise<{
  conversations: Array<{
    id: string;
    name?: string;
    phone?: string;
    isGroup?: boolean;
    lastMessage?: string;
    updatedAt?: string;
  }>;
}> {
  const rows = await fetchInboxMessageRows(options);
  const groups = new Map<string, ConversationGroup>();

  for (const row of rows) {
    const contactKey = getConversationGroupKey(row);
    if (!contactKey) continue;

    const mapped = mapWhatsappMessageRow(row, contactKey);
    if (!mapped) continue;

    const isGroup = isGroupMessageRow(row);
    const name = getConversationDisplayName(row, contactKey);
    const existing = groups.get(contactKey);
    const phone = isGroup ? undefined : resolveConversationPhone(row, contactKey, existing?.phone);
    if (!existing || mapped.rawTimeMs >= existing.updatedAtMs) {
      groups.set(contactKey, {
        id: contactKey,
        name: isGroup
          ? pickBetterGroupName(existing?.name, name)
          : existing?.name && !looksLikeWhatsAppNumber(existing.name)
            ? existing.name
            : name,
        phone,
        isGroup: Boolean(existing?.isGroup || isGroup),
        lastMessage: mapped.text,
        updatedAt: mapped.createdAt,
        updatedAtMs: mapped.rawTimeMs,
      });
    } else if (
      existing &&
      !isGroup &&
      !looksLikeWhatsAppNumber(existing.phone ?? "") &&
      looksLikeWhatsAppNumber(phone)
    ) {
      groups.set(contactKey, { ...existing, phone });
    } else if (existing && isGroup) {
      groups.set(contactKey, {
        ...existing,
        name: pickBetterGroupName(existing.name, name),
        isGroup: true,
      });
    } else if (existing && !existing.name && name) {
      groups.set(contactKey, { ...existing, name });
    }
  }

  const conversations = mergeConversationsByPhone([...groups.values()]).map(
    ({ updatedAtMs: _updatedAtMs, ...conversation }) => {
      if (
        isAiScamDetectAgentContact(conversation.id) ||
        isAiScamDetectAgentContact(conversation.phone)
      ) {
        return { ...conversation, name: AI_SCAM_DETECT_AGENT_DISPLAY_NAME };
      }
      return conversation;
    }
  );

  return { conversations };
}

/** List messages from Whatsapp_Message for a contact conversation. */
export async function listMessagesFromNocoDB(
  conversationId: string,
  options?: ListInboxOptions
): Promise<{
  messages: Array<{
    id: string;
    conversationId: string;
    text?: string;
    fromMe?: boolean;
    createdAt?: string;
    scamPercentage?: number;
    scamDescription?: string;
    senderName?: string;
  }>;
}> {
  const rows = await fetchInboxMessageRows({
    sessionId: options?.sessionId,
  });

  const messages = rows
    .filter((row) => rowMatchesConversationKey(row, conversationId))
    .map((row) => mapWhatsappMessageRow(row, conversationId))
    .filter((message): message is NonNullable<typeof message> => message != null)
    .map(({ rawTimeMs: _rawTimeMs, ...message }) => message);

  messages.sort((a, b) => {
    const na = Number(a.createdAt ?? "");
    const nb = Number(b.createdAt ?? "");
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });

  return { messages };
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function extractSenderPhoneFromAlert(text: string): string {
  const fromMatch = text.match(/來自:\s*\*?([^*\n]+)\*?/);
  if (fromMatch?.[1]) return normalizePhoneDigits(fromMatch[1]);

  const phoneMatch = text.match(/\+?\d[\d\s-]{7,}/);
  return phoneMatch ? normalizePhoneDigits(phoneMatch[0]) : "";
}

function buildFallbackScamReport(params: {
  scamPercentage: number;
  scamDescription?: string;
  originalText?: string;
  contactPhone?: string;
}): string {
  const lines = [
    "🚨🚨🚨 *詐騙警告 — 高風險* 🚨🚨🚨",
    "",
    `⚠️ *風險:* ${params.scamPercentage}% ( ${params.scamPercentage} / 100 )`,
  ];

  if (params.contactPhone) {
    lines.push("", `📞 來自: *${params.contactPhone}*`);
  }

  if (params.scamDescription) {
    lines.push("", params.scamDescription);
  }

  if (params.originalText) {
    lines.push("", "📩 *原文:*", params.originalText);
  }

  return lines.join("\n");
}

/** Find the bot scam alert message linked to a flagged inbox message. */
export async function getScamReportForMessage(
  conversationId: string,
  messageId: string,
  options: ListInboxOptions
): Promise<{ report: string }> {
  if (!options.sessionId) {
    throw new Error("sessionId is required");
  }

  const conversationRows = (await fetchInboxMessageRows({
    sessionId: options.sessionId,
  })).filter((row) => rowMatchesConversationKey(row, conversationId));

  const sourceRow = conversationRows.find(
    (row) => getRowString(row, "Message_id", "Message_Id", "message_id") === messageId
  );

  if (!sourceRow) {
    throw new Error("MESSAGE_NOT_FOUND");
  }

  const scam = getScamFields(sourceRow);
  const originalText = getRowString(sourceRow, "Message", "message", "Text", "text");
  const contactPhone = getContactPhoneFromRow(sourceRow, conversationId);
  const contactDigits = normalizePhoneDigits(contactPhone);
  const sourceTs =
    parseMessageTimestamp(
      getRowString(sourceRow, "timestamp", "CreatedAt", "Created_Time", "created_at")
    ) ?? 0;

  const sessionRows = await fetchInboxMessageRows({ sessionId: options.sessionId });

  const alertCandidates = sessionRows
    .map((row) => {
      const text = getRowString(row, "Message", "message", "Text", "text");
      if (!isScamAlertMessage(text)) return null;

      const alertTs =
        parseMessageTimestamp(
          getRowString(row, "timestamp", "CreatedAt", "Created_Time", "created_at")
        ) ?? 0;

      if (sourceTs > 0 && alertTs > 0) {
        const delta = alertTs - sourceTs;
        if (delta < -120_000 || delta > 900_000) return null;
      }

      const alertPhoneDigits = extractSenderPhoneFromAlert(text);
      const phoneMatches =
        contactDigits.length >= 8 &&
        (alertPhoneDigits.includes(contactDigits.slice(-8)) ||
          contactDigits.includes(alertPhoneDigits.slice(-8)) ||
          normalizePhoneDigits(text).includes(contactDigits.slice(-8)));

      if (contactDigits.length >= 8 && !phoneMatches) return null;

      return { text, alertTs, length: text.length };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate != null)
    .sort((a, b) => {
      if (b.length !== a.length) return b.length - a.length;
      return a.alertTs - b.alertTs;
    });

  const linkedAlert = alertCandidates[0]?.text;
  if (linkedAlert) {
    return { report: linkedAlert };
  }

  if (scam.scamPercentage) {
    return {
      report: buildFallbackScamReport({
        scamPercentage: scam.scamPercentage,
        scamDescription: scam.scamDescription,
        originalText,
        contactPhone: looksLikeWhatsAppNumber(contactPhone) ? contactPhone : undefined,
      }),
    };
  }

  throw new Error("SCAM_REPORT_NOT_FOUND");
}

/**
 * Get the latest message timestamp (ms since epoch) in NocoDB for the messages table.
 * Used to determine if DB is "caught up to today" (latestMessageTs >= now - threshold).
 * Returns null only when the messages table is empty (no rows or no valid Created_Time).
 * Throws on NocoDB HTTP/network error so callers can return caughtUpToToday: false + error.
 */
export async function getLatestMessageTsFromNocoDB(options?: ListInboxOptions): Promise<number | null> {
  const row = await fetchLatestInboxMessageRow(options);
  if (!row) return null;

  const rawTime = getRowString(row, "timestamp", "CreatedAt", "Created_Time", "created_at");
  if (!rawTime) return null;
  return parseMessageTimestamp(rawTime);
}

async function fetchLatestInboxMessageRow(
  options?: ListInboxOptions
): Promise<Record<string, unknown> | null> {
  const tableCandidates = await getMessagesTableCandidates();
  const where = buildInboxWhereClause(options);
  const whereQuery = where ? `&where=${encodeURIComponent(where)}` : "";

  for (const sortField of ["timestamp", "Created_Time", "created_at", "CreatedAt"]) {
    const query = `limit=1&sort=-${encodeURIComponent(sortField)}${whereQuery}`;
    try {
      const res = await fetchFirstOkRecordResponse(tableCandidates, query);
      const data = (await res.json()) as {
        list?: Record<string, unknown>[];
        data?: Record<string, unknown>[];
        records?: Record<string, unknown>[];
      };
      const row = data?.list?.[0] ?? data?.data?.[0] ?? data?.records?.[0];
      if (row) return row;
    } catch {
      continue;
    }
  }

  try {
    const res = await fetchFirstOkRecordResponse(tableCandidates, `limit=1${whereQuery}`);
    const data = (await res.json()) as {
      list?: Record<string, unknown>[];
      data?: Record<string, unknown>[];
      records?: Record<string, unknown>[];
    };
    return data?.list?.[0] ?? data?.data?.[0] ?? data?.records?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Find existing conversation by Conversation_Id. */
async function findConversationByConversationId(
  conversationId: string
): Promise<WhatsAppConversationRow | null> {
  const tableCandidates = await getConversationsTableCandidates();
  const where = `(Conversation_Id,eq,${escapeNocoWhereValue(conversationId)})`;
  const query = `limit=1&where=${encodeURIComponent(where)}`;

  try {
    const res = await fetchFirstOkRecordResponse(tableCandidates, query);
    const data = (await res.json()) as {
      list?: WhatsAppConversationRow[];
      data?: WhatsAppConversationRow[];
      records?: WhatsAppConversationRow[];
    };
    const list = data?.list ?? data?.data ?? data?.records ?? [];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

/** Name rule: do not overwrite existing non-empty Name. Only set when empty or current is phone/"Unknown". */
function resolveName(
  newName: string | null | undefined,
  existingName: string | null | undefined,
  phone: string
): string | undefined {
  const trimmed = newName?.trim();
  const existing = existingName?.trim();
  if (existing && existing !== phone && existing.toLowerCase() !== "unknown")
    return existing;
  if (trimmed) return trimmed;
  return existing || undefined;
}

/** Upsert conversation (idempotent by Conversation_Id). */
export async function upsertConversationToNocoDB(params: {
  Conversation_Id: string;
  Whatsapp_number?: string;
  Name?: string;
  Last_Message?: string;
  Updated_Time?: string;
}): Promise<void> {
  const tableCandidates = await getConversationsTableCandidates();
  const existing = await findConversationByConversationId(params.Conversation_Id);
  const name = resolveName(
    params.Name,
    existing?.Name,
    params.Whatsapp_number ?? ""
  );
  const payload = {
    Conversation_Id: params.Conversation_Id,
    Whatsapp_number: params.Whatsapp_number ?? existing?.Whatsapp_number ?? "",
    Name: name ?? existing?.Name ?? "",
    Last_Message: params.Last_Message ?? existing?.Last_Message ?? "",
    Updated_Time: params.Updated_Time ?? existing?.Updated_Time ?? "",
    Synced_At: new Date().toISOString(),
  };

  const rowId = existing?.Id ?? (existing as { id?: number })?.id;
  if (rowId != null) {
    await patchFirstOk(tableCandidates, rowId, payload);
  } else {
    await postFirstOk(tableCandidates, payload);
  }
}

/** Find existing message by Message_Id. */
async function findMessageByMessageId(
  messageId: string
): Promise<WhatsAppMessageRow | null> {
  const tableCandidates = await getMessagesTableCandidates();
  const where = `(Message_Id,eq,${escapeNocoWhereValue(messageId)})`;
  const query = `limit=1&where=${encodeURIComponent(where)}`;

  try {
    const res = await fetchFirstOkRecordResponse(tableCandidates, query);
    const data = (await res.json()) as {
      list?: WhatsAppMessageRow[];
      data?: WhatsAppMessageRow[];
      records?: WhatsAppMessageRow[];
    };
    const list = data?.list ?? data?.data ?? data?.records ?? [];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

/** Upsert message (idempotent by Message_Id). */
export async function upsertMessageToNocoDB(params: {
  Message_Id: string;
  Conversation_Id: string;
  Text?: string;
  From_Me?: boolean;
  Created_Time?: string;
}): Promise<void> {
  const existing = await findMessageByMessageId(params.Message_Id);
  if (existing) return;

  const tableCandidates = await getMessagesTableCandidates();
  const isFromMe = params.From_Me === true;
  const payload = {
    Message_Id: params.Message_Id,
    Conversation_Id: params.Conversation_Id,
    Text: params.Text ?? "",
    From_Me: isFromMe ? 1 : 0,
    Created_Time: params.Created_Time ?? "",
    Synced_At: new Date().toISOString(),
  };
  await postFirstOk(tableCandidates, payload);
}

/** Get sync state (Last_Cursor, Last_Synced_At). Single row with Sync_Key = "default". */
export async function getSyncState(): Promise<{
  lastCursor: string | null;
  lastSyncedAt: string | null;
}> {
  const tableCandidates = await getSyncTableCandidates();
  const where = `(Sync_Key,eq,default)`;
  const query = `limit=1&where=${encodeURIComponent(where)}`;

  try {
    const res = await fetchFirstOkRecordResponse(tableCandidates, query);
    const data = (await res.json()) as { list?: SyncStateRow[] };
    const row = data?.list?.[0];
    return {
      lastCursor: row?.Last_Cursor ? String(row.Last_Cursor) : null,
      lastSyncedAt: row?.Last_Synced_At ? String(row.Last_Synced_At) : null,
    };
  } catch {
    return { lastCursor: null, lastSyncedAt: null };
  }
}

/** Set sync state. Upsert row with Sync_Key = "default". */
export async function setSyncState(params: {
  Last_Cursor: string | null;
  Last_Synced_At: string;
}): Promise<void> {
  const tableCandidates = await getSyncTableCandidates();
  const where = `(Sync_Key,eq,default)`;
  const query = `limit=1&where=${encodeURIComponent(where)}`;
  const payload = {
    Sync_Key: "default",
    Last_Cursor: params.Last_Cursor ?? "",
    Last_Synced_At: params.Last_Synced_At,
  };

  let existingRow: SyncStateRow | undefined;
  try {
    const res = await fetchFirstOkRecordResponse(tableCandidates, query);
    const data = (await res.json()) as { list?: SyncStateRow[] };
    existingRow = data?.list?.[0];
  } catch {
    existingRow = undefined;
  }

  if (existingRow?.Id != null) {
    await patchFirstOk(tableCandidates, existingRow.Id, payload);
    return;
  }

  await postFirstOk(tableCandidates, payload);
}

const DELETE_MESSAGES_BATCH_SIZE = 100;
const DELETE_MESSAGES_MAX_BATCHES = 500;

function getInboxRowId(row: Record<string, unknown>): string | number | null {
  const rowId = row.Id ?? row.id;
  if (rowId == null || rowId === "") return null;
  return typeof rowId === "number" || typeof rowId === "string" ? rowId : String(rowId);
}

async function fetchInboxMessageRowsSinglePage(
  options: ListInboxOptions,
  limit: number,
  offset: number
): Promise<{ rows: Record<string, unknown>[]; tableId?: string }> {
  const tableCandidates = await getMessagesTableCandidates();
  const fetchOpts = { headers: headers(), cache: "no-store" as RequestCache };
  const where = buildInboxWhereClause(options);
  const whereQuery = where ? `&where=${encodeURIComponent(where)}` : "";
  const query = `limit=${limit}&offset=${offset}${whereQuery}`;

  for (const tableId of tableCandidates) {
    for (const path of recordPathsForTable(tableId, query)) {
      const res = await nocoRecordFetch(path, fetchOpts);
      if (!res.ok) continue;

      const data = (await res.json()) as {
        list?: Record<string, unknown>[];
        data?: Record<string, unknown>[];
        records?: Record<string, unknown>[];
      };
      const list = data?.list ?? data?.data ?? data?.records ?? [];
      return { rows: list, tableId };
    }
  }

  return { rows: [] };
}

/** Delete all Whatsapp_Message rows for a disconnected WhatsApp session. */
export async function deleteWhatsAppMessagesForSession(sessionId: string): Promise<number> {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId) return 0;
  if (!isWhatsAppInboxNocoDBConfigured()) return 0;

  let totalDeleted = 0;
  let tableId: string | undefined;

  for (let batch = 0; batch < DELETE_MESSAGES_MAX_BATCHES; batch++) {
    const page = await fetchInboxMessageRowsSinglePage(
      { sessionId: normalizedSessionId },
      DELETE_MESSAGES_BATCH_SIZE,
      0
    );
    if (!tableId) tableId = page.tableId;
    if (page.rows.length === 0) break;
    if (!tableId) throw new Error("Failed to resolve Whatsapp_Message table for delete");

    const recordIds = page.rows
      .map((row) => getInboxRowId(row))
      .filter((id): id is string | number => id != null);
    if (recordIds.length === 0) break;

    const deleted = await deleteNocoRecordsBatch(tableId, recordIds);
    if (!deleted) {
      throw new Error("Failed to delete Whatsapp_Message rows from NocoDB");
    }

    totalDeleted += recordIds.length;
    if (page.rows.length < DELETE_MESSAGES_BATCH_SIZE) break;
  }

  return totalDeleted;
}
