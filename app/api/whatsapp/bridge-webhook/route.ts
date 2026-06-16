import {
  findWhatsAppConnectionBySessionId,
  getWhatsAppConnectionForUser,
  resolveNocoDbUserId,
  upsertWhatsAppConnectionForUser,
} from "@/lib/nocodb"
import {
  buildUserWhatsAppSessionId,
  isLegacyEmailSessionId,
  isLegacySlotSessionId,
  parseUserIdFromSessionId,
} from "@/lib/whatsapp-session"
import {
  isWhatsAppInboxNocoDBConfigured,
  upsertConversationToNocoDB,
  upsertMessageToNocoDB,
} from "@/lib/whatsapp-inbox-nocodb"
import { NextResponse } from "next/server"

const WA_BRIDGE_WEBHOOK_SECRET = process.env.WA_BRIDGE_WEBHOOK_SECRET?.trim()
const WHATSAPP_INBOUND_WEBHOOK_URL = process.env.WHATSAPP_INBOUND?.trim()
const WHATSAPP_OUTBOUND_WEBHOOK_URL = process.env.WHATSAPP_OUTBOUND?.trim()
const WHATSAPP_WEBHOOK_TIMEOUT_MS = Number(process.env.WHATSAPP_WEBHOOK_TIMEOUT_MS ?? 10000)

function isAuthorized(request: Request): boolean {
  if (!WA_BRIDGE_WEBHOOK_SECRET) return true
  const secretHeader = request.headers.get("x-bridge-secret")?.trim()
  const apiKeyHeader = request.headers.get("x-api-key")?.trim()
  const authHeader = request.headers.get("authorization")?.trim()
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null
  return (
    secretHeader === WA_BRIDGE_WEBHOOK_SECRET ||
    apiKeyHeader === WA_BRIDGE_WEBHOOK_SECRET ||
    bearer === WA_BRIDGE_WEBHOOK_SECRET
  )
}

function normalizePhone(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const digits = input.replace(/[^\d]/g, "")
  if (!digits) return undefined
  return `+${digits}`
}

function normalizeChatId(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined
  const value = input.trim()
  if (!value) return undefined
  return value
}

function resolveTimestamp(input: unknown): string {
  if (typeof input === "number" && Number.isFinite(input)) {
    const ms = input < 1e12 ? input * 1000 : input
    return String(Math.floor(ms))
  }
  if (typeof input === "string" && input.trim()) {
    const parsed = Number(input)
    if (Number.isFinite(parsed)) {
      const ms = parsed < 1e12 ? parsed * 1000 : parsed
      return String(Math.floor(ms))
    }
    const dateMs = Date.parse(input)
    if (!Number.isNaN(dateMs)) return String(dateMs)
  }
  return String(Date.now())
}

function resolveBody(payload: Record<string, unknown>): string {
  const body = payload.body
  if (typeof body === "string") return body
  const text = payload.text
  if (typeof text === "string") return text
  const caption = payload.caption
  if (typeof caption === "string") return caption
  return ""
}

function resolveMessageId(payload: Record<string, unknown>): string | undefined {
  const id = payload.id
  if (typeof id === "string" && id.trim()) return id.trim()
  if (id && typeof id === "object") {
    const maybeSerialized = (id as { _serialized?: unknown })._serialized
    if (typeof maybeSerialized === "string" && maybeSerialized.trim()) return maybeSerialized.trim()
    const maybeId = (id as { id?: unknown }).id
    if (typeof maybeId === "string" && maybeId.trim()) return maybeId.trim()
  }
  return undefined
}

function resolveSessionId(body: Record<string, unknown>, payload: Record<string, unknown>): string {
  const sessionId = body.sessionId ?? payload.sessionId ?? body.session ?? payload.session
  return typeof sessionId === "string" || typeof sessionId === "number" ? String(sessionId) : ""
}

async function resolveWebhookUserId(sessionId: string): Promise<string | null> {
  const parsed = parseUserIdFromSessionId(sessionId)
  if (!parsed) return null
  if (isLegacyEmailSessionId(sessionId)) {
    return resolveNocoDbUserId(parsed)
  }
  return parsed
}

async function handleReadyEvent(
  body: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<void> {
  const sessionId = resolveSessionId(body, payload)
  if (!sessionId || isLegacySlotSessionId(sessionId)) return

  const userId = await resolveWebhookUserId(sessionId)
  if (!userId) return

  const canonicalSessionId = buildUserWhatsAppSessionId(userId)

  const phone =
    normalizePhone(payload.phone) ??
    normalizePhone(payload.number) ??
    normalizePhone((payload.wid as { user?: unknown } | undefined)?.user) ??
    normalizePhone((payload.info as { wid?: { user?: unknown } } | undefined)?.wid?.user)

  await upsertWhatsAppConnectionForUser(userId, canonicalSessionId, phone ?? null, "connected").catch(() => {})
}

function pickPayload(body: Record<string, unknown>): Record<string, unknown> {
  const data = body.data
  if (data && typeof data === "object") return data as Record<string, unknown>
  const payload = body.payload
  if (payload && typeof payload === "object") return payload as Record<string, unknown>
  const message = body.message
  if (message && typeof message === "object") return message as Record<string, unknown>
  return body
}

function getEventType(body: Record<string, unknown>, payload: Record<string, unknown>): string {
  const event = body.event ?? body.type ?? payload.event ?? payload.type
  if (typeof event !== "string") return ""
  return event.toLowerCase()
}

async function handleMessageEvent(
  body: Record<string, unknown>,
  payload: Record<string, unknown>
): Promise<void> {
  const sessionId = resolveSessionId(body, payload)
  const fromMe = Boolean(payload.fromMe)
  const from = normalizeChatId(payload.from)
  const to = normalizeChatId(payload.to)
  const chatId = normalizeChatId(payload.chatId) ?? normalizeChatId(payload.chat)
  const messageId = resolveMessageId(payload)
  if (!messageId) return

  const fallbackConversationId =
    chatId ??
    (fromMe ? to : from) ??
    (typeof sessionId === "string" ? `session:${sessionId}` : "unknown")
  const conversationId = fallbackConversationId
  const text = resolveBody(payload)
  const createdAt = resolveTimestamp(payload.timestamp ?? payload.t ?? payload.createdAt)

  const otherParty = fromMe ? to : from
  const phone =
    normalizePhone(otherParty) ??
    normalizePhone(chatId) ??
    normalizePhone(from) ??
    normalizePhone(to)

  const normalizedSessionId =
    typeof sessionId === "string" || typeof sessionId === "number" ? String(sessionId) : ""
  let connection = normalizedSessionId
    ? await findWhatsAppConnectionBySessionId(normalizedSessionId).catch(() => null)
    : null
  const resolvedUserId =
    connection?.userId ??
    (normalizedSessionId ? await resolveWebhookUserId(normalizedSessionId) : null) ??
    undefined
  if (!connection?.phone && resolvedUserId) {
    connection = await getWhatsAppConnectionForUser(resolvedUserId).catch(() => connection)
  }
  const userId = resolvedUserId
  const whatsappNumber = connection?.phone

  const targetWebhookUrl = fromMe ? WHATSAPP_OUTBOUND_WEBHOOK_URL : WHATSAPP_INBOUND_WEBHOOK_URL
  if (targetWebhookUrl) {
    const direction = fromMe ? "out" : "in"
    const messageWebhookPayload = {
      userId,
      sessionId: normalizedSessionId || undefined,
      whatsappNumber,
      connectedLineNumber: whatsappNumber,
      direction,
      from,
      to,
      body: text,
      action: fromMe ? "message_sent" : "message_received",
      event: getEventType(body, payload) || "message",
      provider: "whatsapp-connect",
      sourceEvent: body.event ?? body.type ?? payload.event ?? payload.type,
      conversationId,
      phone,
      messageId,
      text,
      timestamp: createdAt,
      payload,
      raw: body,
    }
    await fetch(targetWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageWebhookPayload),
      signal: AbortSignal.timeout(WHATSAPP_WEBHOOK_TIMEOUT_MS),
    }).catch(() => {})
  }

  if (!isWhatsAppInboxNocoDBConfigured()) return

  await upsertConversationToNocoDB({
    Conversation_Id: conversationId,
    Whatsapp_number: phone,
    Last_Message: text,
    Updated_Time: createdAt,
  }).catch(() => {})

  await upsertMessageToNocoDB({
    Message_Id: messageId,
    Conversation_Id: conversationId,
    Text: text,
    From_Me: fromMe,
    Created_Time: createdAt,
  }).catch(() => {})
}

export async function POST(request: Request) {
  if (!isAuthorized(request))
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!body || typeof body !== "object")
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 })

  const payload = pickPayload(body)
  const eventType = getEventType(body, payload)
  const looksLikeMessage =
    eventType.includes("message") ||
    typeof payload.body === "string" ||
    typeof payload.fromMe === "boolean"

  if (eventType.includes("ready") || eventType.includes("authenticated"))
    await handleReadyEvent(body, payload)

  if (looksLikeMessage) await handleMessageEvent(body, payload)

  return NextResponse.json({ success: true })
}

export async function GET(request: Request) {
  if (!isAuthorized(request))
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ success: true, message: "ok" })
}
