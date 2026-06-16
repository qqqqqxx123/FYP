export function normalizeWhatsAppPhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

/** WhatsApp number for the automated scam-detection bot inbox contact. */
export const AI_SCAM_DETECT_AGENT_PHONE_DIGITS = "85246262701";

export const AI_SCAM_DETECT_AGENT_DISPLAY_NAME = "AI Scam detect Agent";

export function isAiScamDetectAgentContact(phoneOrId: string | null | undefined): boolean {
  return normalizeWhatsAppPhoneDigits(phoneOrId) === AI_SCAM_DETECT_AGENT_PHONE_DIGITS;
}

export function isSameWhatsAppPhone(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const leftDigits = normalizeWhatsAppPhoneDigits(left);
  const rightDigits = normalizeWhatsAppPhoneDigits(right);
  return Boolean(leftDigits && rightDigits && leftDigits === rightDigits);
}

export function formatWhatsAppPhoneDisplay(phone: string | null | undefined): string {
  const trimmed = String(phone ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  const digits = normalizeWhatsAppPhoneDigits(trimmed);
  return digits ? `+${digits}` : trimmed;
}

export function getWhatsAppPhoneRegion(
  phone: string | null | undefined
): "Hong Kong" | "Outside Hong Kong" | null {
  const digits = normalizeWhatsAppPhoneDigits(phone);
  if (!digits) return null;
  if (digits.startsWith("852")) return "Hong Kong";
  return "Outside Hong Kong";
}

export const DUPLICATE_WHATSAPP_NUMBER_MESSAGE =
  "This WhatsApp number is already connected to another account.";

/** @deprecated Use DUPLICATE_WHATSAPP_NUMBER_MESSAGE */
export const DUPLICATE_WHATSAPP_SLOT_MESSAGE = DUPLICATE_WHATSAPP_NUMBER_MESSAGE;
