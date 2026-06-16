import { resolveNocoDbUserId } from "@/lib/nocodb";
import {
  buildSessionValue,
  buildOtpSessionToken,
  getSessionNocoDbUserId,
  getSessionUserIdentifier,
  isAdminSession,
} from "@/lib/session";
import {
  buildUserWhatsAppSessionId,
  isLegacyEmailSessionId,
  isLegacySlotSessionId,
  parseUserIdFromSessionId,
  parseWhatsAppSlotFromSessionId,
  sessionIdBelongsToUser,
} from "@/lib/whatsapp-session-id";
import { cookies } from "next/headers";

const SESSION_COOKIE = "crm-session";

export {
  WHATSAPP_SESSION_SUFFIX,
  buildUserWhatsAppSessionId,
  isLegacyEmailSessionId,
  isLegacySlotSessionId,
  parseUserIdFromSessionId,
  parseWhatsAppSlotFromSessionId,
} from "@/lib/whatsapp-session-id";

export async function resolveWhatsAppUserIdFromSession(
  session: string | undefined
): Promise<string> {
  const userIdFromCookie = getSessionNocoDbUserId(session);
  if (userIdFromCookie) return userIdFromCookie;

  const identifier = getSessionUserIdentifier(session);
  if (!identifier) return "";
  return (await resolveNocoDbUserId(identifier)) ?? "";
}

export async function ensureSessionIncludesNocoDbUserId(): Promise<void> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  if (getSessionNocoDbUserId(session)) return;

  const email = getSessionUserIdentifier(session);
  if (!email?.includes("@")) return;

  const userId = await resolveNocoDbUserId(email);
  if (!userId) return;

  try {
    cookieStore.set(
      SESSION_COOKIE,
      buildSessionValue(buildOtpSessionToken(userId, email), isAdminSession(session)),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 8,
      }
    );
  } catch {
    // Called outside a Route Handler / Server Action — skip cookie write.
  }
}

export async function requireWhatsAppUser(options?: {
  sessionId?: string | null;
}): Promise<{
  userId: string;
  sessionId: string;
  slot: number;
}> {
  await ensureSessionIncludesNocoDbUserId();

  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await resolveWhatsAppUserIdFromSession(session);
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const requestedSessionId = options?.sessionId?.trim();
  if (requestedSessionId) {
    if (!sessionIdBelongsToUser(requestedSessionId, userId)) {
      throw new Error("INVALID_SESSION");
    }
    return {
      userId,
      sessionId: requestedSessionId,
      slot: parseWhatsAppSlotFromSessionId(requestedSessionId),
    };
  }

  const sessionId = buildUserWhatsAppSessionId(userId, 1);
  return { userId, sessionId, slot: 1 };
}
