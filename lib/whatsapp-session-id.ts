export const WHATSAPP_SESSION_SUFFIX = "_whatsapp_1";

export function normalizeWhatsAppUserIdPart(userId: string): string {
  return userId.trim().replace(/[^\w-]/g, "");
}

export function buildUserWhatsAppSessionId(userId: string, slot = 1): string {
  const normalized = normalizeWhatsAppUserIdPart(userId);
  if (!normalized) throw new Error("INVALID_USER_ID");
  return `user_${normalized}_whatsapp_${slot}`;
}

export function parseUserIdFromSessionId(sessionId: string): string | null {
  const trimmed = sessionId.trim();
  const match = trimmed.match(/^user_(.+)_whatsapp_(\d+)$/);
  if (!match) return null;
  return match[1] || null;
}

export function parseWhatsAppSlotFromSessionId(sessionId: string): number {
  const match = sessionId.trim().match(/_whatsapp_(\d+)$/);
  if (!match) return 1;
  const slot = Number.parseInt(match[1], 10);
  return Number.isFinite(slot) && slot > 0 ? slot : 1;
}

export function buildNextWhatsAppSessionId(sessionId: string, nextSlot: number): string {
  const trimmed = sessionId.trim();
  const base = trimmed.replace(/_whatsapp_\d+$/, "");
  return `${base}_whatsapp_${nextSlot}`;
}

export function isLegacySlotSessionId(sessionId: string): boolean {
  return sessionId === "1" || sessionId === "2";
}

export function isLegacyEmailSessionId(sessionId: string): boolean {
  return parseUserIdFromSessionId(sessionId)?.includes("@") ?? false;
}

export function sessionIdBelongsToUser(sessionId: string, userId: string): boolean {
  const ownerId = parseUserIdFromSessionId(sessionId);
  if (!ownerId) return false;
  return ownerId === normalizeWhatsAppUserIdPart(userId);
}
