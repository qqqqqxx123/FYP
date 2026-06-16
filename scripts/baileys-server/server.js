/**
 * Bailey / Baileys WhatsApp bridge for CRM.
 * Run: npm install && npm start
 *
 * API (VPS / WA_BRIDGE_URL):
 *   POST /api/start-session     { sessionId }
 *   POST /api/logout-session    { sessionId }
 *   GET  /api/session-status?sessionId=...
 *
 * Legacy (BAILEYS_API_URL):
 *   POST /connect?sessionId=...
 *   GET  /status?sessionId=...
 *   POST /disconnect?sessionId=...
 */

import http from "http";
import { existsSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4050;
const AUTH_ROOT = process.env.BAILEYS_AUTH_DIR
  ? path.resolve(process.env.BAILEYS_AUTH_DIR)
  : __dirname;

/** @type {Map<string, { sock: import("@whiskeysockets/baileys").WASocket, qr: string | null, phone: string | undefined }>} */
const clients = new Map();
const startingSessions = new Set();

function sanitizeSessionKey(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolveSessionKeyFromQuery(url) {
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId?.trim()) return sanitizeSessionKey(sessionId.trim());
  const slotParam = url.searchParams.get("slot");
  if (slotParam === "2") return "2";
  if (slotParam === "1") return "1";
  return "1";
}

function getAuthDir(sessionKey) {
  return path.join(AUTH_ROOT, `auth_${sanitizeSessionKey(sessionKey)}`);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sessionStatusPayload(sessionKey) {
  const entry = clients.get(sessionKey);
  if (!entry) {
    return { connected: false, status: "disconnected" };
  }
  return {
    connected: !!entry.phone,
    status: entry.phone ? "connected" : entry.qr ? "waiting_qr" : "connecting",
    phone: entry.phone || undefined,
    qr: entry.qr || undefined,
  };
}

function cleanupStaleLockFiles(baseDir) {
  if (!existsSync(baseDir)) return;
  const lockFiles = ["SingletonLock", "SingletonSocket", "SingletonCookie"];
  for (const lockFile of lockFiles) {
    const lockPath = path.join(baseDir, lockFile);
    if (existsSync(lockPath)) {
      try {
        rmSync(lockPath, { force: true });
        console.log("[CHROME LOCK CLEANUP]", lockPath, new Date().toISOString());
      } catch {
        // ignore
      }
    }
  }
}

async function startClient(sessionKey) {
  const existing = clients.get(sessionKey);
  if (existing) return existing;
  if (startingSessions.has(sessionKey)) {
    while (startingSessions.has(sessionKey)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const afterWait = clients.get(sessionKey);
    if (afterWait) return afterWait;
  }

  startingSessions.add(sessionKey);
  console.log("[SESSION START]", sessionKey, new Date().toISOString());

  try {
  const authDir = getAuthDir(sessionKey);
  cleanupStaleLockFiles(authDir);
  cleanupStaleLockFiles(AUTH_ROOT);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  });

  const entry = { sock, qr: null, phone: undefined };
  clients.set(sessionKey, entry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const current = clients.get(sessionKey);
    if (!current) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        current.qr = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
      } catch {
        current.qr = null;
      }
    }

    if (connection === "open") {
      current.phone =
        sock.user?.id?.split(":")[0] != null
          ? "+" + sock.user.id.split(":")[0]
          : undefined;
      current.qr = null;
      console.log("[SESSION READY]", sessionKey, current.phone ?? "unknown", new Date().toISOString());
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (
        code === DisconnectReason.loggedOut ||
        code === DisconnectReason.connectionReplaced
      ) {
        current.phone = undefined;
        current.qr = null;
      }
    }
  });

  return entry;
  } finally {
    startingSessions.delete(sessionKey);
  }
}

async function destroyClient(sessionKey) {
  console.log("[SESSION CLEANUP]", sessionKey, new Date().toISOString());
  const entry = clients.get(sessionKey);
  if (entry?.sock) {
    try {
      await entry.sock.logout();
    } catch {
      // session may already be closed
    }
    try {
      if (typeof entry.sock.end === "function") {
        entry.sock.end(undefined);
      }
    } catch {
      // ignore
    }
    try {
      if (typeof entry.sock.destroy === "function") {
        entry.sock.destroy();
      }
    } catch {
      // ignore
    }
  }

  clients.delete(sessionKey);
  startingSessions.delete(sessionKey);

  const authDir = getAuthDir(sessionKey);
  cleanupStaleLockFiles(authDir);
  if (existsSync(authDir)) {
    rmSync(authDir, { recursive: true, force: true });
    console.log("[SESSION CLEANUP]", "removed auth folder", authDir);
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, x-api-key");
    res.writeHead(204);
    res.end();
    return;
  }

  const body =
    req.method === "POST" ? await readJsonBody(req) : {};
  const sessionIdFromBody = body.sessionId ?? body.session ?? body.name;
  const sessionKey = sessionIdFromBody
    ? sanitizeSessionKey(String(sessionIdFromBody))
    : resolveSessionKeyFromQuery(url);

  if (req.method === "POST" && url.pathname === "/api/start-session") {
    try {
      await startClient(sessionKey);
      sendJson(res, 200, { success: true, started: true, ...sessionStatusPayload(sessionKey) });
    } catch (e) {
      sendJson(res, 500, { success: false, message: String(e.message || e) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout-session") {
    console.log("[LOGOUT REQUEST]", sessionKey, new Date().toISOString());
    try {
      await destroyClient(sessionKey);
      sendJson(res, 200, { success: true, ok: true, sessionId: sessionKey });
    } catch (e) {
      sendJson(res, 500, { success: false, message: String(e.message || e) });
    }
    return;
  }

  function respondSessionInfo(targetSessionKey, res) {
    sendJson(res, 200, { sessionId: targetSessionKey, ...sessionStatusPayload(targetSessionKey) });
  }

  if (req.method === "GET" && url.pathname === "/api/session-status") {
    respondSessionInfo(sessionKey, res);
    return;
  }

  const sessionInfoMatch = url.pathname.match(/^\/api\/session-info\/(.+)$/);
  if (req.method === "GET" && sessionInfoMatch) {
    const infoSessionKey = sanitizeSessionKey(decodeURIComponent(sessionInfoMatch[1]));
    respondSessionInfo(infoSessionKey, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/session-info") {
    respondSessionInfo(sessionKey, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/connect") {
    try {
      const existing = clients.get(sessionKey);
      if (existing?.qr) {
        sendJson(res, 200, { qr: existing.qr });
        return;
      }
      if (existing?.phone) {
        sendJson(res, 200, { phone: existing.phone });
        return;
      }
      await startClient(sessionKey);
      sendJson(res, 200, { started: true });
    } catch (e) {
      sendJson(res, 500, { message: String(e.message || e) });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    const payload = sessionStatusPayload(sessionKey);
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/disconnect") {
    try {
      await destroyClient(sessionKey);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 500, { message: String(e.message || e) });
    }
    return;
  }

  sendJson(res, 404, { message: "Not found" });
});

server.listen(PORT, () => {
  console.log("Bailey bridge running at http://localhost:" + PORT);
  console.log(
    "API: POST /api/start-session, POST /api/logout-session, GET /api/session-status, GET /api/session-info"
  );
});
