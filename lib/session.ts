const ADMIN_SESSION_PREFIX = "admin:";

export function isAdminSession(session: string | undefined): boolean {
  return !!session?.trim().startsWith(ADMIN_SESSION_PREFIX);
}

function stripSessionPrefixes(session: string): string {
  let value = session.trim();
  if (value.startsWith(ADMIN_SESSION_PREFIX)) value = value.slice(ADMIN_SESSION_PREFIX.length);
  return value;
}

interface OtpSessionPayload {
  userId?: string;
  email?: string;
}

function parseOtpSessionPayload(session: string | undefined): OtpSessionPayload {
  if (!session?.trim()) return {};

  const value = stripSessionPrefixes(session);
  if (!value.startsWith("otp:")) return {};

  const payload = value.slice(4).trim();
  if (!payload) return {};

  const pipeIdx = payload.indexOf("|");
  if (pipeIdx > 0) {
    const left = payload.slice(0, pipeIdx).trim();
    const right = payload.slice(pipeIdx + 1).trim();
    if (/^\d+$/.test(left) && right) {
      return { userId: left, email: right };
    }
  }

  if (/^\d+$/.test(payload)) {
    return { userId: payload };
  }

  return { email: payload };
}

/** Build session token with NocoDB user id embedded for reliable WhatsApp auth. */
export function buildOtpSessionToken(
  userId: string | null | undefined,
  email: string
): string {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUserId = userId?.trim();
  if (normalizedUserId && /^\d+$/.test(normalizedUserId)) {
    return `otp:${normalizedUserId}|${normalizedEmail}`;
  }
  return `otp:${normalizedEmail}`;
}

/** NocoDB Users table Id from session cookie, when present. */
export function getSessionNocoDbUserId(session: string | undefined): string {
  const { userId } = parseOtpSessionPayload(session);
  return userId ?? "";
}

export function getUsernameFromSession(session: string | undefined): string {
  if (!session?.trim()) return "User";

  const { userId, email } = parseOtpSessionPayload(session);
  if (email) return email;
  if (userId) return userId;

  const value = stripSessionPrefixes(session);
  if (value.startsWith("otp:")) {
    const id = value.slice(4).trim();
    return id || "User";
  }

  return "User";
}

/** Lowercase email or user id from session; empty when unknown. */
export function getSessionUserIdentifier(session: string | undefined): string {
  const { userId, email } = parseOtpSessionPayload(session);
  if (email) return email.trim().toLowerCase();
  if (userId) return userId.trim().toLowerCase();

  const username = getUsernameFromSession(session);
  if (!username || username === "User") return "";
  return username.trim().toLowerCase();
}

export function buildSessionValue(token: string, isAdmin: boolean): string {
  return isAdmin ? `${ADMIN_SESSION_PREFIX}${token}` : token;
}
