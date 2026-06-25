import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

/** Whether auth cookies use the Secure flag. Set COOKIE_SECURE=false on HTTP-only VPS. */
export function isSecureCookie(): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function getAuthCookieOptions(maxAge: number): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    path: "/",
    maxAge,
  };
}
