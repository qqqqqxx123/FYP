/**
 * Wooztell API client (server-only).
 * Uses Open API (GraphQL) for conversations/messages; supports send via GraphQL mutation or config.
 * No DB, no logging of message content or phone numbers.
 */

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;

function getBaseUrl(): string {
  const url = process.env.WOOZTELL_API_BASE_URL?.trim();
  if (!url) throw new Error("WOOZTELL_API_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

function getToken(): string {
  const token = process.env.WOOZTELL_API_TOKEN?.trim();
  if (!token) throw new Error("WOOZTELL_API_TOKEN is not set");
  return token;
}

/** Optional: your business/own WhatsApp number. When set, we show the *other* party's number in the list. */
function getOurPhoneNormalized(): string | null {
  const raw =
    process.env.WOOZTELL_BUSINESS_PHONE?.trim() ||
    process.env.WOOZTELL_OUR_NUMBER?.trim() ||
    null;
  if (!raw) return null;
  return raw.replace(/\D/g, "") || null;
}

function normalizePhoneForCompare(p: string): string {
  return p.replace(/\D/g, "");
}

/** In-memory cache: phone (normalized) -> display name. Populated from message events. */
const phoneNameCache = new Map<string, string>();

/** Mask for logs: never log message content or full phone numbers. */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "***";
  return phone.slice(-4).padStart(phone.length, "*");
}

/** Parsed message event for sync. */
export interface ParsedMessageEvent {
  conversationId: string;
  otherPhone: string;
  name: string | null;
  lastMessage: string | undefined;
  updatedTime: string | undefined;
  messageId: string;
  text: string | undefined;
  fromMe: boolean;
}

/** Parse one message event for NocoDB sync. */
export function parseMessageEvent(
  raw: unknown,
  nodeId?: string,
  edgeCursor?: string,
  contactsMap?: Record<string, string>
): ParsedMessageEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const ev = raw as Record<string, unknown>;
  const from = ev.from != null ? String(ev.from) : "";
  const to = ev.to != null ? String(ev.to) : "";
  const parts = [from, to].filter(Boolean);
  const conversationId =
    parts.length >= 2 ? parts.sort().join("_") : (from || to || (nodeId ?? edgeCursor ?? ""));
  if (!conversationId) return null;

  const ourPhoneNorm = getOurPhoneNormalized();
  const otherPhone = ourPhoneNorm
    ? (normalizePhoneForCompare(from) === ourPhoneNorm ? to : from)
    : (from || to);

  const memberExtra =
    ev.memberExtra && typeof ev.memberExtra === "object"
      ? (ev.memberExtra as Record<string, unknown>)
      : null;
  const memberExtraData =
    ev.memberExtraData && typeof ev.memberExtraData === "object"
      ? (ev.memberExtraData as Record<string, unknown>)
      : null;
  const rawName =
    (typeof ev.profileName === "string" ? ev.profileName : null) ??
    (typeof ev.profile_name === "string" ? ev.profile_name : null) ??
    (memberExtra && typeof memberExtra.name === "string" ? memberExtra.name : null) ??
    (memberExtraData && typeof memberExtraData.name === "string" ? memberExtraData.name : null) ??
    (typeof ev.name === "string" ? ev.name : null) ??
    (typeof ev.contactName === "string" ? ev.contactName : null) ??
    (typeof ev.pushName === "string" ? ev.pushName : null) ??
    (typeof ev.notifyName === "string" ? ev.notifyName : null) ??
    (otherPhone && contactsMap?.[normalizePhoneForCompare(otherPhone)]) ??
    null;

  const dataObj =
    ev.data && typeof ev.data === "object" ? (ev.data as Record<string, unknown>) : null;
  const text =
    typeof ev.text === "string"
      ? ev.text
      : (dataObj && typeof dataObj.text === "string" ? dataObj.text : undefined) ??
        (typeof ev.body === "string" ? ev.body : undefined) ??
        (typeof ev.content === "string" ? ev.content : undefined);
  const ts = ev.timestamp != null ? String(ev.timestamp) : undefined;
  const messageId = String(
    nodeId ?? ev.messageId ?? ev.id ?? edgeCursor ?? Math.random().toString(36)
  );
  const key = ev.key && typeof ev.key === "object" ? (ev.key as Record<string, unknown>) : null;
  const fromMe =
    ev.fromMe === true ||
    ev.from_me === true ||
    ev.isOutgoing === true ||
    ev.is_outgoing === true ||
    ev.sentByMe === true ||
    ev.outgoing === true ||
    (typeof ev.direction === "string" && /^out/i.test(ev.direction)) ||
    (key && (key.fromMe === true || key.from_me === true)) ||
    (ourPhoneNorm && normalizePhoneForCompare(from) === ourPhoneNorm);

  return {
    conversationId,
    otherPhone,
    name: rawName?.trim() || null,
    lastMessage: text,
    updatedTime: ts,
    messageId,
    text: text ?? (ev.type === "TEXT" ? "" : undefined),
    fromMe,
  };
}

export interface WooztellConversation {
  id: string;
  name?: string;
  lastMessage?: string;
  updatedAt?: string;
  /** Optional phone/identifier (masked in logs). */
  phone?: string;
}

export interface WooztellMessage {
  id: string;
  conversationId: string;
  text?: string;
  fromMe?: boolean;
  createdAt?: string;
}

export interface ListConversationsResult {
  conversations: WooztellConversation[];
  pageInfo?: { hasNextPage: boolean; endCursor?: string };
}

export interface GetMessagesResult {
  messages: WooztellMessage[];
  pageInfo?: { hasNextPage: boolean; endCursor?: string };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let lastError: Error | null = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  clearTimeout(timeout);
  throw lastError ?? new Error("Request failed");
}

function graphqlRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const base = getBaseUrl();
  const token = getToken();
  const url = base.endsWith("/v3") || base.includes("graphql") ? base : `${base.replace(/\/$/, "")}/v3`;
  return fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  }).then(async (res) => {
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
    const opMatch = query.match(/(?:query|mutation)\s+(\w+)/);
    const opName = opMatch?.[1] ?? "unknown";
    if (!res.ok) {
      const msg = json.errors?.[0]?.message ?? res.statusText ?? "Wooztell API error";
      console.error("[Wooztell] GraphQL error:", opName, redactForLog(msg));
      throw new Error(msg);
    }
    if (json.errors?.length) {
      const msg = json.errors[0].message ?? "GraphQL error";
      console.error("[Wooztell] GraphQL error:", opName, redactForLog(msg));
      throw new Error(msg);
    }
    return json.data as T;
  });
}

/** Raw page of conversationHistory for sync. */
export interface ConversationHistoryPage {
  edges: Array<{ node: { id?: string; messageEvent?: unknown }; cursor?: string }>;
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
}

/**
 * Fetch one page of conversationHistory (for sync). Supports optional after cursor.
 * Wooztell schema uses IntMax100 for first, so we cap at 100 to match listConversations.
 */
export async function fetchConversationHistoryPage(options: {
  first: number;
  after?: string | null;
}): Promise<ConversationHistoryPage> {
  const first = Math.min(options?.first ?? 100, 100);
  const variables: Record<string, unknown> = { first };
  if (options.after != null && options.after !== "") variables.after = options.after;
  const query = variables.after
    ? `
    query getChatHistoryPage($first: IntMax100, $after: String) {
      apiViewer {
        conversationHistory(first: $first, after: $after) {
          edges { node { id messageEvent } cursor }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `
    : `
    query getChatHistoryPage($first: IntMax100) {
      apiViewer {
        conversationHistory(first: $first) {
          edges { node { id messageEvent } cursor }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        conversationHistory?: {
          edges: Array<{ node: { id?: string; messageEvent?: unknown }; cursor?: string }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string };
        };
      };
    }>(query, variables);
    const history = data?.apiViewer?.conversationHistory;
    if (!history) return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
    return {
      edges: history.edges ?? [],
      pageInfo: {
        hasNextPage: !!history.pageInfo?.hasNextPage,
        endCursor: history.pageInfo?.endCursor ?? null,
      },
    };
  } catch {
    return { edges: [], pageInfo: { hasNextPage: false, endCursor: null } };
  }
}

/**
 * List conversations (Open API conversationHistory).
 * Wooztell returns message events; we group by conversation and return unique conversations.
 */
export async function listConversations(options?: {
  first?: number;
  after?: string;
}): Promise<ListConversationsResult> {
  const first = Math.min(options?.first ?? 50, 100);
  const query = `
    query getChatHistory($first: IntMax100) {
      apiViewer {
        conversationHistory(first: $first) {
          edges {
            node {
              id
              messageEvent
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        conversationHistory?: {
          edges: Array<{ node: { id?: string; messageEvent?: unknown }; cursor?: string }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string };
        };
      };
    }>(query, { first });

    const history = data?.apiViewer?.conversationHistory;
    if (!history) {
      return { conversations: [], pageInfo: { hasNextPage: false } };
    }

    const ourPhoneNorm = getOurPhoneNormalized();
    const byConv = new Map<string, WooztellConversation>();
    for (const edge of history.edges ?? []) {
      const node = edge?.node;
      const raw = node?.messageEvent;
      if (!raw || typeof raw !== "object") continue;
      const ev = raw as Record<string, unknown>;
      const from = ev.from != null ? String(ev.from) : "";
      const to = ev.to != null ? String(ev.to) : "";
      const parts = [from, to].filter(Boolean);
      const convId = parts.length >= 2 ? parts.sort().join("_") : (from || to || (node?.id ?? edge.cursor ?? ""));
      if (!convId) continue;
      const existing = byConv.get(convId);
      const ts = ev.timestamp != null ? String(ev.timestamp) : undefined;
      const otherPhone = ourPhoneNorm
        ? (normalizePhoneForCompare(from) === ourPhoneNorm ? to : from)
        : (from || to);
      const memberExtra = ev.memberExtra && typeof ev.memberExtra === "object" ? (ev.memberExtra as Record<string, unknown>) : null;
      const memberExtraData = ev.memberExtraData && typeof ev.memberExtraData === "object" ? (ev.memberExtraData as Record<string, unknown>) : null;
      const rawName =
        (typeof ev.profileName === "string" ? ev.profileName : null) ??
        (typeof ev.profile_name === "string" ? ev.profile_name : null) ??
        (memberExtra && typeof memberExtra.name === "string" ? memberExtra.name : null) ??
        (memberExtraData && typeof memberExtraData.name === "string" ? memberExtraData.name : null) ??
        (typeof ev.name === "string" ? ev.name : null) ??
        (typeof ev.contactName === "string" ? ev.contactName : null) ??
        (typeof ev.contact_name === "string" ? ev.contact_name : null) ??
        (typeof ev.senderName === "string" ? ev.senderName : null) ??
        (typeof ev.sender_name === "string" ? ev.sender_name : null) ??
        (typeof ev.pushName === "string" ? ev.pushName : null) ??
        (typeof ev.push_name === "string" ? ev.push_name : null) ??
        (typeof ev.notifyName === "string" ? ev.notifyName : null) ??
        existing?.name;
      if (rawName && otherPhone) {
        phoneNameCache.set(normalizePhoneForCompare(otherPhone), rawName);
      }
      const name =
        rawName ??
        (otherPhone ? (phoneNameCache.get(normalizePhoneForCompare(otherPhone)) ?? null) : null) ??
        existing?.name;
      const lastMsg =
        typeof ev.text === "string"
          ? ev.text
          : (ev.data && typeof (ev.data as { text?: string }).text === "string"
              ? (ev.data as { text: string }).text
              : undefined) ?? existing?.lastMessage;
      if (!existing || (ts && (!existing.updatedAt || ts > existing.updatedAt))) {
        byConv.set(convId, {
          id: convId,
          name: (name ?? existing?.name) ?? undefined,
          lastMessage: lastMsg,
          updatedAt: ts ?? existing?.updatedAt,
          phone: otherPhone || existing?.phone,
        });
      }
    }

    const conversations = Array.from(byConv.values()).sort((a, b) => {
      const ta = a.updatedAt ?? "";
      const tb = b.updatedAt ?? "";
      const na = Number(ta);
      const nb = Number(tb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
      return tb.localeCompare(ta);
    });

    const pageInfo = history.pageInfo
      ? { hasNextPage: !!history.pageInfo.hasNextPage, endCursor: history.pageInfo.endCursor }
      : undefined;

    return { conversations, pageInfo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list conversations";
    throw new Error(message);
  }
}

export interface GetContactsResult {
  contacts: Record<string, string>;
}

/** Member info for live-chat control: id (Wooztell memberId) and current liveChat flag. */
export interface MemberLiveChatInfo {
  memberId: string;
  liveChat: boolean;
}

/**
 * Get Wooztell member by externalId (phone). Returns memberId and liveChat status for live-chat toggle.
 * Used to resolve conversation's customer to a Wooztell member so we can update botMeta.liveChat.
 */
export async function getMemberByPhone(phone: string): Promise<MemberLiveChatInfo | null> {
  const normalized = normalizePhoneForCompare(phone);
  if (!normalized) return null;
  const query = `
    query getMembersForLiveChat($first: IntMax100) {
      apiViewer {
        members(first: $first) {
          edges {
            node {
              id
              externalId
              botMeta {
                liveChat
              }
            }
          }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        members?: {
          edges: Array<{
            node?: {
              id?: string;
              externalId?: string;
              botMeta?: { liveChat?: boolean };
            };
          }>;
        };
      };
    }>(query, { first: 100 });
    const edges = data?.apiViewer?.members?.edges ?? [];
    for (const edge of edges) {
      const node = edge?.node;
      const externalId = node?.externalId;
      if (!externalId || typeof node?.id !== "string") continue;
      if (normalizePhoneForCompare(externalId) === normalized) {
        const liveChat = node?.botMeta?.liveChat === true;
        return { memberId: node.id, liveChat };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update a member's live chat status (Wooztell botMeta.liveChat).
 * When true, the member is in "live chat" mode (human agent); when false, the bot handles the conversation.
 */
export async function updateMemberLiveChat(
  memberId: string,
  liveChat: boolean
): Promise<{ success: boolean }> {
  const mutation = `
    mutation updateMemberLiveChat($memberId: ID!, $input: UpdateMemberInput!) {
      updateMember(memberId: $memberId, input: $input) {
        member {
          id
          botMeta {
            liveChat
          }
        }
      }
    }
  `;
  try {
    await graphqlRequest<{
      updateMember?: {
        member?: { id?: string; botMeta?: { liveChat?: boolean } };
      };
    }>(mutation, {
      memberId,
      input: { botMeta: { liveChat } },
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update live chat";
    throw new Error(message);
  }
}

/**
 * Derive the "other" (customer) phone from a conversation id.
 * Conversation id is "phoneA_phoneB" (sorted). When WOOZTELL_BUSINESS_PHONE is set, returns the part that is not our number.
 */
export function getOtherPhoneFromConversationId(conversationId: string): string | null {
  const parts = conversationId.split("_").filter(Boolean);
  if (parts.length === 0) return null;
  const ourNorm = getOurPhoneNormalized();
  if (ourNorm) {
    const other = parts.find((p) => normalizePhoneForCompare(p) !== ourNorm);
    return other ?? parts[0] ?? null;
  }
  return parts[0] ?? null;
}

/**
 * Fetch contacts (phone -> display name) from Wooztell members API if available.
 * Falls back to empty map if API does not support it. The in-memory phoneNameCache
 * in listConversations enriches names from message events as a fallback.
 */
export async function getContacts(): Promise<GetContactsResult> {
  const query = `
    query getMembers($first: IntMax100) {
      apiViewer {
        members(first: $first) {
          edges {
            node {
              externalId
              firstName
              lastName
            }
          }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        members?: {
          edges: Array<{
            node?: { externalId?: string; firstName?: string; lastName?: string };
          }>;
        };
      };
    }>(query, { first: 100 });

    const edges = data?.apiViewer?.members?.edges ?? [];
    const contacts: Record<string, string> = {};
    for (const edge of edges) {
      const node = edge?.node;
      const externalId = node?.externalId;
      if (!externalId || typeof externalId !== "string") continue;
      const phone = normalizePhoneForCompare(externalId);
      const first = node?.firstName ?? "";
      const last = node?.lastName ?? "";
      const displayName = [first, last].filter(Boolean).join(" ").trim();
      if (displayName) {
        contacts[phone] = displayName;
        phoneNameCache.set(phone, displayName);
      }
    }
    return { contacts };
  } catch {
    return { contacts: {} };
  }
}

/**
 * Get messages for a conversation. Fetches conversationHistory and filters by conversationId.
 */
export async function getMessages(
  conversationId: string,
  options?: { first?: number; after?: string }
): Promise<GetMessagesResult> {
  const first = Math.min(options?.first ?? 100, 100);
  const query = `
    query getChatHistory($first: IntMax100) {
      apiViewer {
        conversationHistory(first: $first) {
          edges {
            node {
              id
              messageEvent
            }
            cursor
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        conversationHistory?: {
          edges: Array<{ node: { id?: string; messageEvent?: unknown }; cursor?: string }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string };
        };
      };
    }>(query, { first });

    const history = data?.apiViewer?.conversationHistory;
    const messages: WooztellMessage[] = [];
    for (const edge of history?.edges ?? []) {
      const node = edge?.node;
      const raw = node?.messageEvent;
      if (!raw || typeof raw !== "object") continue;
      const ev = raw as Record<string, unknown>;
      const from = ev.from != null ? String(ev.from) : "";
      const to = ev.to != null ? String(ev.to) : "";
      const parts = [from, to].filter(Boolean);
      const msgConvId = parts.length >= 2 ? parts.sort().join("_") : (from || to);
      if (msgConvId !== conversationId) continue;
      const dataObj = ev.data && typeof ev.data === "object" ? (ev.data as Record<string, unknown>) : null;
      const text =
        typeof ev.text === "string"
          ? ev.text
          : (dataObj && typeof dataObj.text === "string"
              ? dataObj.text
              : undefined) ??
        (typeof ev.body === "string" ? ev.body : undefined) ??
        (typeof ev.content === "string" ? ev.content : undefined);
      const ts = ev.timestamp != null ? String(ev.timestamp) : undefined;
      const ourPhoneNorm = getOurPhoneNormalized();
      const key = ev.key && typeof ev.key === "object" ? (ev.key as Record<string, unknown>) : null;
      const fromMe =
        ev.fromMe === true ||
        ev.from_me === true ||
        ev.isOutgoing === true ||
        ev.is_outgoing === true ||
        ev.sentByMe === true ||
        ev.outgoing === true ||
        (typeof ev.direction === "string" && /^out/i.test(ev.direction)) ||
        (key && (key.fromMe === true || key.from_me === true)) ||
        (ourPhoneNorm && normalizePhoneForCompare(from) === ourPhoneNorm);
      messages.push({
        id: String(node?.id ?? ev.messageId ?? ev.id ?? edge.cursor ?? Math.random()),
        conversationId,
        text: text ?? (ev.type === "TEXT" ? "" : undefined),
        fromMe,
        createdAt: ts,
      });
    }

    messages.sort((a, b) => {
      const ta = a.createdAt ?? "";
      const tb = b.createdAt ?? "";
      const na = Number(ta);
      const nb = Number(tb);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return ta.localeCompare(tb);
    });

    const pageInfo = history?.pageInfo
      ? { hasNextPage: !!history.pageInfo.hasNextPage, endCursor: history.pageInfo.endCursor }
      : undefined;

    return { messages, pageInfo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get messages";
    throw new Error(message);
  }
}

function getChannelId(): string {
  const id = process.env.WOOZTELL_CHANNEL_ID?.trim();
  if (!id) throw new Error("WOOZTELL_CHANNEL_ID is not set (required for send)");
  return id;
}

/** Redact IDs from object for safe logging. */
function redactForLog(obj: unknown): unknown {
  if (obj == null) return obj;
  if (typeof obj !== "object") return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (key.includes("id") || key.includes("phone") || key === "channel") {
      out[k] = v != null ? "[redacted]" : v;
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = redactForLog(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Channel-level bot status (virtual: derived from per-member liveChat).
 * liveChat = false → bot ON (enabled). liveChat = true → human mode (enabled = false).
 */
export interface ChannelBotStatus {
  enabled: boolean;
}

export interface SetChannelBotResult {
  success: boolean;
  total: number;
  updated: number;
  failed: number;
}

/** Process toggles sequentially with delay to avoid Wooztell rate limit (Too Many Request). */
const BOT_CONCURRENCY = 1;
const BOT_DELAY_MS = 800;

/**
 * Get display name for a member by phone (externalId).
 * Returns "firstName lastName" from Wooztell member API; null if not found.
 * Used to populate NocoDB Conversation.Name when syncing.
 */
export async function getMemberDisplayName(phone: string): Promise<string | null> {
  const map = await getMemberDisplayNamesForChannel();
  const normalized = normalizePhoneForCompare(phone);
  return (normalized && map[normalized]) ?? null;
}

/**
 * Fetch all channel member display names in one request (firstName + lastName).
 * Returns Record<normalizedPhone, displayName>. Use this instead of calling
 * getMemberDisplayName per phone to avoid Wooztell "Too Many Request" rate limits.
 */
export async function getMemberDisplayNamesForChannel(
  channelId?: string
): Promise<Record<string, string>> {
  const cid = channelId ?? getChannelId();
  const query = `
    query MembersForName($channelId: String!, $first: IntMax100) {
      apiViewer {
        members(channelId: $channelId, first: $first) {
          edges {
            node {
              externalId
              firstName
              lastName
            }
          }
        }
      }
    }
  `;
  try {
    const data = await graphqlRequest<{
      apiViewer?: {
        members?: {
          edges: Array<{
            node?: { externalId?: string; firstName?: string; lastName?: string };
          }>;
        };
      };
    }>(query, { channelId: cid, first: 100 });
    const edges = data?.apiViewer?.members?.edges ?? [];
    const out: Record<string, string> = {};
    for (const edge of edges) {
      const node = edge?.node;
      const externalId = node?.externalId;
      if (!externalId || typeof externalId !== "string") continue;
      const phone = normalizePhoneForCompare(externalId);
      const first = (node?.firstName ?? "").trim();
      const last = (node?.lastName ?? "").trim();
      const name = [first, last].filter(Boolean).join(" ").trim();
      if (name) out[phone] = name;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Fetch all members for a channel (paginated).
 * Returns { externalId, liveChat } for each member.
 */
export async function fetchChannelMembers(
  channelId: string
): Promise<Array<{ externalId: string; liveChat: boolean }>> {
  const all: Array<{ externalId: string; liveChat: boolean }> = [];
  let after: string | null = null;
  const first = 100;

  const query = `
    query Members($channelId: String!, $first: IntMax100, $after: String) {
      apiViewer {
        members(channelId: $channelId, first: $first, after: $after) {
          edges {
            node {
              externalId
              botMeta { liveChat }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;

  for (;;) {
    const variables: Record<string, unknown> = { channelId, first };
    if (after) variables.after = after;
    const data = await graphqlRequest<{
      apiViewer?: {
        members?: {
          edges: Array<{
            node?: { externalId?: string; botMeta?: { liveChat?: boolean } };
          }>;
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        };
      };
    }>(query, variables);
    const members = data?.apiViewer?.members;
    const edges = members?.edges ?? [];
    const pageInfo = members?.pageInfo;

    for (const edge of edges) {
      const node = edge?.node;
      const externalId = node?.externalId;
      if (externalId && typeof externalId === "string") {
        const liveChat = node?.botMeta?.liveChat === true;
        all.push({ externalId, liveChat });
      }
    }

    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break;
    after = pageInfo.endCursor;
  }
  return all;
}

/**
 * Toggle live chat for one member.
 * liveChat = true → human mode (bot OFF). liveChat = false → bot mode (bot ON).
 * Retries once after 2s on "Too Many Request" to respect Wooztell rate limit.
 */
export async function toggleMemberLiveChat(
  channelId: string,
  externalId: string,
  liveChat: boolean
): Promise<{ success: boolean }> {
  const mutation = `
    mutation ToggleLiveChat($input: toggleLiveChatInput!) {
      toggleLiveChat(input: $input) {
        clientMutationId
      }
    }
  `;
  const input = {
    externalId,
    channel: channelId,
    liveChat,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await graphqlRequest<{ toggleLiveChat?: { clientMutationId?: string } }>(mutation, { input });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = /too many request|429|rate limit/i.test(msg);
      if (isRateLimit && attempt === 0) {
        await delay(2000);
        continue;
      }
      if (attempt > 0 || !isRateLimit) {
        console.error("[Wooztell] toggleLiveChat failed for externalId [redacted]:", msg);
      }
      return { success: false };
    }
  }
  return { success: false };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run items through fn with limited concurrency and delay between each to respect rate limits. */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  delayMs: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item === undefined) break;
      if (idx > 0) await delay(delayMs);
      const res = await fn(item);
      results[idx] = res;
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Get virtual channel bot status by sampling first member's liveChat.
 * liveChat = false → bot ON (enabled). liveChat = true → human mode (enabled = false).
 */
export async function getChannelBotStatus(channelId?: string): Promise<ChannelBotStatus> {
  const cid = channelId ?? getChannelId();
  const members = await fetchChannelMembers(cid);
  if (members.length === 0) {
    return { enabled: true };
  }
  const first = members[0];
  if (!first) return { enabled: true };
  return { enabled: !first.liveChat };
}

/**
 * Set virtual channel bot on/off by toggling liveChat for ALL members.
 * enabled = true → bot ON → set liveChat = false for each member.
 * enabled = false → bot OFF → set liveChat = true for each member.
 * Processes in batches with limited concurrency. Logs failures but continues.
 */
export async function setChannelBotStatus(
  enabled: boolean,
  channelId?: string
): Promise<SetChannelBotResult> {
  return setChannelBotStatusWithProgress(enabled, channelId);
}

/**
 * Same as setChannelBotStatus but calls onProgress(updated, total) after each member.
 * Used by API to report progress for background toggle.
 */
export async function setChannelBotStatusWithProgress(
  enabled: boolean,
  channelId?: string,
  onProgress?: (updated: number, total: number) => void
): Promise<SetChannelBotResult> {
  const cid = channelId ?? getChannelId();
  const members = await fetchChannelMembers(cid);
  const liveChat = !enabled;

  if (members.length === 0) {
    onProgress?.(0, 0);
    return { success: true, total: 0, updated: 0, failed: 0 };
  }

  let updated = 0;
  let failed = 0;

  if (onProgress) {
    for (let i = 0; i < members.length; i++) {
      if (i > 0) await delay(BOT_DELAY_MS);
      const r = await toggleMemberLiveChat(cid, members[i].externalId, liveChat);
      if (r.success) updated++;
      else failed++;
      onProgress(updated, members.length);
    }
  } else {
    const results = await runWithConcurrency(
      members,
      BOT_CONCURRENCY,
      async (m) => toggleMemberLiveChat(cid, m.externalId, liveChat),
      BOT_DELAY_MS
    );
    for (const r of results) {
      if (r.success) updated++;
      else failed++;
    }
  }

  if (failed > 0) {
    console.warn(`[Wooztell] setChannelBotStatus: ${updated} updated, ${failed} failed`);
  }
  return {
    success: failed === 0,
    total: members.length,
    updated,
    failed,
  };
}

/**
 * Send a text message via Wooztell Bot API (POST sendResponses).
 * Uses WOOZTELL_BOT_API_URL (default https://bot.api.woztell.com), WOOZTELL_API_TOKEN, WOOZTELL_CHANNEL_ID.
 */
export async function sendMessage(params: {
  conversationId?: string;
  to?: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string }> {
  const { conversationId, to, text } = params;
  if (!text?.trim()) throw new Error("Message text is required");
  const recipientId = (to ?? conversationId ?? "").toString().trim();
  if (!recipientId) throw new Error("Either conversationId or to (phone) is required");

  const botBase =
    process.env.WOOZTELL_BOT_API_URL?.trim()?.replace(/\/$/, "") ||
    "https://bot.api.woztell.com";
  const token = getToken();
  const channelId = getChannelId();
  const url = `${botBase}/sendResponses?accessToken=${encodeURIComponent(token)}`;

  const body = {
    channelId,
    recipientId,
    memberId: null as string | null,
    response: [{ type: "TEXT", text: text.trim() }],
  };

  try {
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as {
      ok?: number;
      err_code?: number;
      error?: string;
      sendResult?: { result?: Array<{ messageEvent?: { messageId?: string } }> };
    };
    if (res.ok && data.ok === 1) {
      const messageId = data.sendResult?.result?.[0]?.messageEvent?.messageId;
      return { success: true, messageId };
    }
    const errMsg = data.error ?? res.statusText ?? "Send failed";
    throw new Error(errMsg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    throw new Error(msg);
  }
}
