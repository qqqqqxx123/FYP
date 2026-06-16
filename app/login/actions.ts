"use server";

import { isAdminUserByIdentifier, resolveNocoDbUserId } from "@/lib/nocodb";
import {
  buildOtpSessionToken,
  buildSessionValue,
  getSessionNocoDbUserId,
  getUsernameFromSession,
} from "@/lib/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "crm-session";
const REGISTER_PENDING_COOKIE = "register-pending";
const LOGIN_PENDING_COOKIE = "login-pending";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function getLoginRequestOtpWebhookUrl(): string | undefined {
  return (
    process.env.LOGIN_REQUEST_OTP_WEBHOOK_URL?.trim() ||
    process.env.AUTH_REQUEST_OTP_WEBHOOK_URL?.trim() ||
    undefined
  );
}

function getLoginVerifyOtpWebhookUrl(): string | undefined {
  return process.env.LOGIN_OTP_WEBHOOK_URL?.trim() || undefined;
}

function getRegisterRequestOtpWebhookUrl(): string | undefined {
  return (
    process.env.REGISTER_OTP_WEBHOOK_URL?.trim() ||
    process.env.REGISTER_WEBHOOK_URL?.trim() ||
    process.env.AUTH_REGISTER_OTP_WEBHOOK_URL?.trim() ||
    undefined
  );
}

function getRegisterVerifyOtpWebhookUrl(): string | undefined {
  return (
    process.env.REGISTER_Ver_OTP_WEBHOOK?.trim() ||
    process.env.REGISTER_VERIFY_OTP_WEBHOOK_URL?.trim() ||
    undefined
  );
}

function getLogoutWebhookUrl(): string | undefined {
  return process.env.LOGOUT_WEBHOOK_URL?.trim() || undefined;
}

function getN8nWebhookUrlCandidates(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed.includes("/webhook-test/")) return [trimmed];
  const productionUrl = trimmed.replace("/webhook-test/", "/webhook/");
  return productionUrl === trimmed ? [trimmed] : [trimmed, productionUrl];
}

function isWebhookNotRegisteredResponse(response: Response, data: unknown): boolean {
  if (response.status !== 404) return false;
  const message = getWebhookMessage(data).toLowerCase();
  return message.includes("not registered") || message.includes("is not registered");
}

async function fetchN8nWebhook(
  url: string,
  init: RequestInit
): Promise<{ response: Response; data: unknown }> {
  const candidates = getN8nWebhookUrlCandidates(url);
  let lastResponse: Response | null = null;
  let lastData: unknown = null;

  for (const candidate of candidates) {
    const response = await fetch(candidate, init);
    const data = await response.json().catch(() => null);
    lastResponse = response;
    lastData = data;
    if (response.ok || !isWebhookNotRegisteredResponse(response, data)) {
      return { response, data };
    }
  }

  return { response: lastResponse!, data: lastData };
}

function getSafeRedirectPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  return value;
}

function getTokenFromResponse(data: Record<string, unknown>): string | null {
  const tokenKeys = ["token", "jwt", "authToken", "accessToken"] as const;
  for (const key of tokenKeys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

interface LoginPendingPayload {
  email: string;
  password: string;
  from: string;
  createdAt: number;
}

function encodeLoginPendingPayload(payload: LoginPendingPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeLoginPendingPayload(value: string): LoginPendingPayload | null {
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const data = JSON.parse(raw) as Partial<LoginPendingPayload>;
    if (!data.email || !data.password || !data.from || !data.createdAt) return null;
    return {
      email: data.email,
      password: data.password,
      from: data.from,
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}

function getWebhookMessage(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const record = entry as Record<string, unknown>;
  if (typeof record.Message === "string") return record.Message;
  if (typeof record.message === "string") return record.message;
  return "";
}

function collectWebhookEntries(data: unknown): Record<string, unknown>[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.flatMap((entry) => collectWebhookEntries(entry));
  }
  if (typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  const nested = record.json ?? record.body ?? record.data;
  if (nested && nested !== data) {
    return [record, ...collectWebhookEntries(nested)];
  }
  return [record];
}

function isWebhookSuccess(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as Record<string, unknown>;
  const success = record.success;
  return success === true || success === 1 || String(success).toLowerCase() === "true";
}

function isWebhookFailure(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as Record<string, unknown>;
  const success = record.success;
  return success === false || String(success).toLowerCase() === "false";
}

function isAdminLoginEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (!isWebhookSuccess(entry)) return false;
  return getWebhookMessage(entry).toLowerCase().includes("admin login");
}

function isAdminLoginResponse(data: unknown): boolean {
  return collectWebhookEntries(data).some((entry) => isAdminLoginEntry(entry));
}

function isLoginOtpRequestedEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  if (isAdminLoginEntry(entry)) return false;
  if (!isWebhookSuccess(entry)) return false;

  const message = getWebhookMessage(entry).toLowerCase();
  if (!message) return true;
  return (
    message.includes("otp sent") ||
    message.includes("sent to email") ||
    message.includes("email address") ||
    message.includes("requests otp")
  );
}

function isLoginOtpRequestedResponse(data: unknown): boolean {
  return collectWebhookEntries(data).some((entry) => isLoginOtpRequestedEntry(entry));
}

async function requestLoginOtpWebhook(
  email: string,
  password: string
): Promise<{ otpRequested: boolean; adminLogin?: boolean; error?: string }> {
  const webhookUrl = getLoginRequestOtpWebhookUrl();
  if (!webhookUrl) return { otpRequested: false };

  const nocodbUserId = await resolveNocoDbUserId(email);

  try {
    const { response, data } = await fetchN8nWebhook(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "login_request_otp",
        email,
        password,
        userId: nocodbUserId ?? undefined,
        Id: nocodbUserId ?? undefined,
        system: "AI.S.D.S",
        requestedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const message =
        (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
          ? (data as { message: string }).message
          : "") || "Unable to send OTP. Please try again.";
      return { otpRequested: false, error: message.trim() };
    }

    if (isAdminLoginResponse(data)) {
      return { otpRequested: false, adminLogin: true };
    }

    const entries = collectWebhookEntries(data);
    const failureEntry = entries.find((entry) => isWebhookFailure(entry));
    if (failureEntry) {
      return {
        otpRequested: false,
        error: getWebhookMessage(failureEntry) || "Unable to send OTP. Please try again.",
      };
    }

    if (isLoginOtpRequestedResponse(data) || entries.some((entry) => isWebhookSuccess(entry))) {
      return { otpRequested: true };
    }

    return {
      otpRequested: false,
      error: "OTP was not sent. Please check your email and try again.",
    };
  } catch {
    return { otpRequested: false, error: "Unable to send OTP. Please try again." };
  }
}

function getUserIdFromVerifyResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const payload = record.data;
  if (!payload || typeof payload !== "object") return null;
  const userId = (payload as Record<string, unknown>).userId;
  return typeof userId === "string" && userId.trim() ? userId.trim() : null;
}

async function buildLoginSessionToken(
  email: string,
  preferredUserId?: string
): Promise<string> {
  const nocodbUserId =
    (preferredUserId ? await resolveNocoDbUserId(preferredUserId) : null) ??
    (await resolveNocoDbUserId(email));
  return buildOtpSessionToken(nocodbUserId, email);
}

async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

async function verifyLoginOtpWebhook(
  email: string,
  otp: string
): Promise<{ verified: boolean; error?: string; userId?: string }> {
  const webhookUrl = getLoginVerifyOtpWebhookUrl();
  if (!webhookUrl) {
    return { verified: false, error: "OTP verify webhook is not configured" };
  }

  const nocodbUserId = await resolveNocoDbUserId(email);

  try {
    const { response, data } = await fetchN8nWebhook(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "login_verify_otp",
        username: email,
        email,
        otp,
        userId: nocodbUserId ?? undefined,
        Id: nocodbUserId ?? undefined,
        system: "AI.S.D.S",
        requestedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const message = getWebhookMessage(data) || "Invalid OTP. Please try again.";
      return { verified: false, error: message };
    }

    if (isOtpVerifiedResponse(data)) {
      return {
        verified: true,
        userId: getUserIdFromVerifyResponse(data) ?? email,
      };
    }

    if (data && typeof data === "object" && (data as Record<string, unknown>).success === false) {
      return {
        verified: false,
        error: getWebhookMessage(data) || "Invalid OTP. Please try again.",
      };
    }

    return { verified: false, error: "Invalid OTP. Please try again." };
  } catch {
    return { verified: false, error: "Unable to verify OTP. Please try again." };
  }
}

async function completeNocodbLogin(email: string, password: string): Promise<string> {
  const baseUrl = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new Error("not_configured");
  }

  const response = await fetch(`${baseUrl}/api/v1/auth/user/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("invalid_credentials");
  }

  const data = (await response.json()) as Record<string, unknown>;
  return getTokenFromResponse(data) ?? `session:${Date.now()}`;
}

async function resolvePostLoginRedirect(
  identifier: string,
  fallbackPath: string
): Promise<string> {
  const isAdmin = await isAdminUserByIdentifier(identifier).catch(() => false);
  return isAdmin ? "/admin" : fallbackPath;
}

interface RegisterPendingPayload {
  email: string;
  password: string;
  createdAt: number;
}

function encodeRegisterPendingPayload(payload: RegisterPendingPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeRegisterPendingPayload(value: string): RegisterPendingPayload | null {
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    const data = JSON.parse(raw) as Partial<RegisterPendingPayload>;
    if (!data.email || !data.password || !data.createdAt) return null;
    return {
      email: data.email,
      password: data.password,
      createdAt: data.createdAt,
    };
  } catch {
    return null;
  }
}

function isOtpVerifiedEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const record = entry as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status.toLowerCase() : "";
  const message = getWebhookMessage(entry).toLowerCase();
  return (
    record.success === true ||
    record.verified === true ||
    record.ok === true ||
    status === "ok" ||
    status === "success" ||
    status === "verified" ||
    message.includes("register otp verified") ||
    message.includes("verified successfully") ||
    message.includes("verified")
  );
}

function isOtpVerifiedResponse(data: unknown): boolean {
  if (Array.isArray(data)) return data.some((entry) => isOtpVerifiedEntry(entry));
  return isOtpVerifiedEntry(data);
}

function normalizeRegisterWebhookErrorMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized) return "";
  if (normalized.toLowerCase().includes("user already exist")) return "User Already Exist";
  return normalized;
}

function getRegisterWebhookError(data: unknown): string {
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const message =
        typeof record.message === "string"
          ? record.message
          : typeof record.Message === "string"
            ? record.Message
            : "";
      const normalizedMessage = normalizeRegisterWebhookErrorMessage(message);
      if (normalizedMessage) return normalizedMessage;
      if (record.success === false) return "Registration failed. Please try again.";
    }
    return "";
  }

  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const message =
    typeof record.message === "string"
      ? record.message
      : typeof record.Message === "string"
        ? record.Message
        : "";
  const normalizedMessage = normalizeRegisterWebhookErrorMessage(message);
  if (normalizedMessage) return normalizedMessage;
  if (record.success === false) return "Registration failed. Please try again.";
  return "";
}

function isRegisterWebhookFailure(data: unknown): boolean {
  if (Array.isArray(data))
    return data.some(
      (entry) => !!entry && typeof entry === "object" && (entry as Record<string, unknown>).success === false
    );
  if (!data || typeof data !== "object") return false;
  return (data as Record<string, unknown>).success === false;
}

async function requestRegisterOtpWebhook(email: string, password: string): Promise<void> {
  const webhookUrl = getRegisterRequestOtpWebhookUrl();

  if (!webhookUrl) {
    redirect(
      `/login?showRegister=1&registerError=${encodeURIComponent(
        "Register webhook is not configured"
      )}`
    );
  }

  try {
    const { response, data: rawData } = await fetchN8nWebhook(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "register_request_otp",
        email,
        password,
        system: "AI.S.D.S",
        requestedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    const data = (rawData ?? {}) as unknown;

    if (!response.ok) {
      const message = getRegisterWebhookError(data) || "Unable to send OTP. Please try again.";
      redirect(
        `/login?showRegister=1&registerError=${encodeURIComponent(message)}`
      );
    }

    if (isRegisterWebhookFailure(data)) {
      const message = getRegisterWebhookError(data) || "Registration failed. Please try again.";
      redirect(`/login?showRegister=1&registerError=${encodeURIComponent(message)}`);
    }
  } catch {
    redirect(
      `/login?showRegister=1&registerError=${encodeURIComponent(
        "Unable to send OTP. Please try again."
      )}`
    );
  }
}

async function verifyRegisterOtpWebhook(
  email: string,
  otp: string
): Promise<{ verified: boolean; error?: string }> {
  const webhookUrl = getRegisterVerifyOtpWebhookUrl();

  if (!webhookUrl) {
    return { verified: false, error: "Register verify webhook is not configured" };
  }

  try {
    const { response, data: rawData } = await fetchN8nWebhook(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "register_verify_otp",
        email,
        otp,
        system: "AI.S.D.S",
        requestedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    const data = rawData as unknown;

    if (!response.ok) {
      const message = getRegisterWebhookError(data) || getWebhookMessage(data) || "Invalid OTP. Please try again.";
      return { verified: false, error: message };
    }

    if (isOtpVerifiedResponse(data)) return { verified: true };

    if (isRegisterWebhookFailure(data)) {
      return {
        verified: false,
        error: getRegisterWebhookError(data) || "Invalid OTP. Please try again.",
      };
    }

    return { verified: false, error: "Invalid OTP. Please try again." };
  } catch {
    return { verified: false, error: "Unable to verify OTP. Please try again." };
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  const from = getSafeRedirectPath(formData.get("from"));

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Email and password are required")}`);
  }

  const webhookUrl = getLoginRequestOtpWebhookUrl();
  if (webhookUrl) {
    const otpResult = await requestLoginOtpWebhook(email, password);
    if (otpResult.error) {
      redirect(`/login?error=${encodeURIComponent(otpResult.error)}`);
    }
    if (otpResult.adminLogin) {
      await setSessionCookie(
        buildSessionValue(await buildLoginSessionToken(email), true)
      );
      redirect("/admin");
    }
    if (otpResult.otpRequested) {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE);
      cookieStore.set(
        LOGIN_PENDING_COOKIE,
        encodeLoginPendingPayload({ email, password, from, createdAt: Date.now() }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 10,
        }
      );
      redirect(`/login?loginOtpRequired=1&loginEmail=${encodeURIComponent(email)}`);
    }
  }

  try {
    await completeNocodbLogin(email, password);
    const isAdmin = await isAdminUserByIdentifier(email).catch(() => false);
    await setSessionCookie(
      buildSessionValue(await buildLoginSessionToken(email), isAdmin)
    );
    const destination = isAdmin ? "/admin" : from;
    redirect(destination);
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_credentials") {
      redirect(`/login?error=${encodeURIComponent("Invalid email or password")}`);
    }
    if (error instanceof Error && error.message === "not_configured") {
      redirect(`/login?error=${encodeURIComponent("Server is not configured for login")}`);
    }
    redirect(`/login?error=${encodeURIComponent("Login failed. Please try again.")}`);
  }
}

export async function verifyLoginOtpAction(formData: FormData): Promise<void> {
  const otp = String(formData.get("otp") ?? "").trim();
  const loginEmail = String(formData.get("loginEmail") ?? "").trim().toLowerCase();

  if (!/^\d{6}$/.test(otp)) {
    redirect(
      `/login?loginOtpRequired=1&loginEmail=${encodeURIComponent(
        loginEmail
      )}&loginOtpError=${encodeURIComponent("Please enter a valid 6-digit OTP")}`
    );
  }

  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get(LOGIN_PENDING_COOKIE)?.value;
  const pending = pendingCookie ? decodeLoginPendingPayload(pendingCookie) : null;

  if (!pending || pending.email !== loginEmail) {
    cookieStore.delete(LOGIN_PENDING_COOKIE);
    redirect(`/login?error=${encodeURIComponent("Login session expired. Please sign in again.")}`);
  }

  const verifyResult = await verifyLoginOtpWebhook(pending.email, otp);
  if (!verifyResult.verified) {
    redirect(
      `/login?loginOtpRequired=1&loginEmail=${encodeURIComponent(
        loginEmail
      )}&loginOtpError=${encodeURIComponent(verifyResult.error ?? "Invalid OTP. Please try again.")}`
    );
  }

  cookieStore.delete(LOGIN_PENDING_COOKIE);

  const sessionUserId = verifyResult.userId ?? pending.email;
  const isAdmin = await isAdminUserByIdentifier(pending.email).catch(() => false);
  await setSessionCookie(
    buildSessionValue(
      await buildLoginSessionToken(pending.email, sessionUserId),
      isAdmin
    )
  );
  const destination = await resolvePostLoginRedirect(pending.email, pending.from);
  redirect(destination);
}

export async function registerAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "").trim();
  const confirmPassword = String(formData.get("confirmPassword") ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    redirect(`/login?registerError=${encodeURIComponent("Please enter a valid email address")}`);
  }

  if (!STRONG_PASSWORD_PATTERN.test(password)) {
    redirect(
      `/login?registerError=${encodeURIComponent(
        "Password must be at least 8 characters and include letters, numbers, and symbols"
      )}`
    );
  }

  if (password !== confirmPassword) {
    redirect(`/login?registerError=${encodeURIComponent("Passwords do not match")}`);
  }

  const baseUrl = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    redirect(
      `/login?showRegister=1&registerError=${encodeURIComponent(
        "Server is not configured for registration"
      )}`
    );
  }

  await requestRegisterOtpWebhook(email, password);

  (await cookies()).set(
    REGISTER_PENDING_COOKIE,
    encodeRegisterPendingPayload({ email, password, createdAt: Date.now() }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    }
  );

  redirect(`/login?showRegister=1&otpRequired=1&registerEmail=${encodeURIComponent(email)}`);
}

export async function verifyRegisterOtpAction(formData: FormData): Promise<void> {
  const otp = String(formData.get("otp") ?? "").trim();
  const registerEmail = String(formData.get("registerEmail") ?? "")
    .trim()
    .toLowerCase();

  if (!/^\d{6}$/.test(otp)) {
    redirect(
      `/login?showRegister=1&otpRequired=1&registerEmail=${encodeURIComponent(
        registerEmail
      )}&otpError=${encodeURIComponent("Please enter a valid 6-digit OTP")}`
    );
  }

  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get(REGISTER_PENDING_COOKIE)?.value;
  const pending = pendingCookie ? decodeRegisterPendingPayload(pendingCookie) : null;

  if (!pending || pending.email !== registerEmail) {
    cookieStore.delete(REGISTER_PENDING_COOKIE);
    redirect(
      `/login?showRegister=1&registerError=${encodeURIComponent(
        "Register session expired. Please register again."
      )}`
    );
  }

  const verifyResult = await verifyRegisterOtpWebhook(registerEmail, otp);
  if (!verifyResult.verified) {
    redirect(
      `/login?showRegister=1&otpRequired=1&registerEmail=${encodeURIComponent(
        registerEmail
      )}&otpError=${encodeURIComponent(
        verifyResult.error ?? "Invalid OTP. Please try again."
      )}`
    );
  }

  cookieStore.delete(REGISTER_PENDING_COOKIE);
  redirect("/login?registered=1");
}

async function fireLogoutWebhook(session: string | undefined): Promise<void> {
  const webhookUrl = getLogoutWebhookUrl();
  if (!webhookUrl) return;

  const email = getUsernameFromSession(session);
  const nocodbUserId = getSessionNocoDbUserId(session);

  try {
    await fetchN8nWebhook(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "logout",
        email,
        username: email,
        userId: nocodbUserId || undefined,
        Id: nocodbUserId || undefined,
        system: "AI.S.D.S",
        requestedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });
  } catch {
    // Logout should succeed even if webhook fails
  }
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  await fireLogoutWebhook(session);
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LOGIN_PENDING_COOKIE);
  cookieStore.delete(REGISTER_PENDING_COOKIE);
  redirect("/login");
}
