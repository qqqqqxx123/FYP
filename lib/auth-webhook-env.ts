/**
 * Read server env at request time. Use dynamic keys — Next.js inlines
 * `process.env.MY_VAR` at build time, so .env changes after build are ignored.
 */
function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getLoginRequestOtpWebhookUrl(): string | undefined {
  return readEnv("LOGIN_REQUEST_OTP_WEBHOOK_URL", "AUTH_REQUEST_OTP_WEBHOOK_URL");
}

export function getLoginVerifyOtpWebhookUrl(): string | undefined {
  return readEnv("LOGIN_OTP_WEBHOOK_URL");
}

/** Sends register OTP email — not the verify step. */
export function getRegisterRequestOtpWebhookUrl(): string | undefined {
  return readEnv(
    "REGISTER_REQUEST_OTP_WEBHOOK_URL",
    "REGISTER_OTP_WEBHOOK_URL",
    "REGISTER_WEBHOOK_URL",
    "AUTH_REGISTER_OTP_WEBHOOK_URL"
  );
}

/** Verifies register OTP at Reg-verify-otp (never login verify-otp). */
export function getRegisterVerifyOtpWebhookUrl(): string | undefined {
  const dedicated = readEnv(
    "REGISTER_Ver_OTP_WEBHOOK",
    "REGISTER_VER_OTP_WEBHOOK",
    "REGISTER_REG_VERIFY_OTP_WEBHOOK_URL",
    "REGISTER_REG_VERIFY_OTP_WEBHOOK"
  );
  if (dedicated) return dedicated;

  const fallback = readEnv("REGISTER_VERIFY_OTP_WEBHOOK_URL");
  if (!fallback) return undefined;

  const loginVerifyUrl = getLoginVerifyOtpWebhookUrl();
  if (loginVerifyUrl && fallback === loginVerifyUrl) return undefined;

  return fallback;
}

export function getLogoutWebhookUrl(): string | undefined {
  return readEnv("LOGOUT_WEBHOOK_URL");
}
