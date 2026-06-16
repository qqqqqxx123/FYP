import {
  findConnectedUserByWhatsAppPhone,
  getWhatsAppConnectionForUser,
} from "@/lib/nocodb";
import {
  DUPLICATE_WHATSAPP_NUMBER_MESSAGE,
  isSameWhatsAppPhone,
} from "@/lib/whatsapp-phone";

export async function assertWhatsAppPhoneAvailableForUser(
  userId: string,
  phone: string | null,
  status: "connected" | "disconnected"
): Promise<void> {
  if (status !== "connected" || !phone?.trim()) return;

  const existingUserId = await findConnectedUserByWhatsAppPhone(phone, userId);
  if (existingUserId) {
    throw new Error(DUPLICATE_WHATSAPP_NUMBER_MESSAGE);
  }

  const currentConnection = await getWhatsAppConnectionForUser(userId);
  if (
    currentConnection?.status === "connected" &&
    currentConnection.phone &&
    isSameWhatsAppPhone(phone, currentConnection.phone)
  ) {
    return;
  }
}
