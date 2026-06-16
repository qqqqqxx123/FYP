/**
 * whatsapp-web.js bridge for CRM (VPS / WA_BRIDGE_URL).
 *
 * POST /api/start-session     { sessionId }
 * POST /api/logout-session    { sessionId }
 * GET  /api/session-status?sessionId=...
 * GET  /api/session-info/:sessionId
 */

import express from "express";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3003;
const AUTH_ROOT = process.env.WWEBJS_AUTH_DIR
  ? path.resolve(process.env.WWEBJS_AUTH_DIR)
  : path.join(__dirname, "wwebjs_auth");

const CHROME_LOCK_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

/** @type {Map<string, { client: import('whatsapp-web.js').Client, qr: string | null, phone: string | undefined, status: string }>} */
const clients = new Map();
const startingSessions = new Set();

function sanitizeSessionId(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getLocalAuthClientId(sessionId) {
  return sanitizeSessionId(sessionId);
}

function getLocalAuthSessionDirs(sessionId) {
  const clientId = getLocalAuthClientId(sessionId);
  return [
    path.join(AUTH_ROOT, `session-${clientId}`),
    path.join(AUTH_ROOT, ".wwebjs_auth", `session-${clientId}`),
    path.join(__dirname, ".wwebjs_auth", `session-${clientId}`),
  ];
}

function ensureAuthRoot() {
  if (!fs.existsSync(AUTH_ROOT)) {
    fs.mkdirSync(AUTH_ROOT, { recursive: true });
  }
}

function removePathIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function cleanupChromeLocks(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return;

  const queue = [baseDir];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const lockFile of CHROME_LOCK_FILES) {
      const lockPath = path.join(current, lockFile);
      if (fs.existsSync(lockPath)) {
        try {
          fs.rmSync(lockPath, { force: true });
          console.log("[CHROME LOCK CLEANUP]", lockPath, new Date().toISOString());
        } catch (error) {
          console.warn("[CHROME LOCK CLEANUP]", lockPath, String(error));
        }
      }
    }

    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      queue.push(path.join(current, entry.name));
    }
  }
}

function removeLocalAuthFolders(sessionId) {
  let removed = false;
  for (const sessionDir of getLocalAuthSessionDirs(sessionId)) {
    if (removePathIfExists(sessionDir)) {
      removed = true;
      console.log("[SESSION CLEANUP]", "removed LocalAuth folder", sessionDir);
    }
    cleanupChromeLocks(sessionDir);
  }
  cleanupChromeLocks(AUTH_ROOT);
  return removed;
}

function sessionStatusPayload(sessionId) {
  const entry = clients.get(sessionId);
  if (!entry) {
    return { sessionId, connected: false, status: "disconnected" };
  }

  return {
    sessionId,
    connected: entry.status === "connected" && Boolean(entry.phone),
    status: entry.status,
    phone: entry.phone,
    qr: entry.status === "connected" ? undefined : entry.qr || undefined,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSessionStart(sessionId, timeoutMs = 120000) {
  const startedAt = Date.now();
  while (startingSessions.has(sessionId)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for session start: ${sessionId}`);
    }
    await sleep(250);
  }
}

async function destroyClient(sessionId) {
  console.log("[SESSION CLEANUP]", sessionId, new Date().toISOString());

  const entry = clients.get(sessionId);
  if (entry?.client) {
    try {
      await entry.client.logout();
    } catch (error) {
      console.warn("[SESSION CLEANUP]", sessionId, "logout failed", String(error));
    }
    try {
      await entry.client.destroy();
    } catch (error) {
      console.warn("[SESSION CLEANUP]", sessionId, "destroy failed", String(error));
    }
  }

  clients.delete(sessionId);
  startingSessions.delete(sessionId);
  removeLocalAuthFolders(sessionId);
}

async function startClient(sessionId) {
  const existing = clients.get(sessionId);
  if (existing) return existing;

  if (startingSessions.has(sessionId)) {
    await waitForSessionStart(sessionId);
    const afterWait = clients.get(sessionId);
    if (afterWait) return afterWait;
  }

  startingSessions.add(sessionId);
  console.log("[SESSION START]", sessionId, new Date().toISOString());

  try {
    ensureAuthRoot();

    for (const sessionDir of getLocalAuthSessionDirs(sessionId)) {
      cleanupChromeLocks(sessionDir);
    }
    cleanupChromeLocks(AUTH_ROOT);

    const clientId = getLocalAuthClientId(sessionId);
    const entry = {
      client: null,
      qr: null,
      phone: undefined,
      status: "connecting",
    };

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId,
        dataPath: AUTH_ROOT,
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      },
    });

    entry.client = client;
    clients.set(sessionId, entry);

    client.on("qr", async (qr) => {
      try {
        entry.qr = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
        entry.status = "waiting_qr";
      } catch (error) {
        console.warn("[SESSION START]", sessionId, "qr encode failed", String(error));
        entry.qr = null;
      }
    });

    client.on("ready", () => {
      const wid = client.info?.wid?.user;
      entry.phone = wid ? `+${wid}` : undefined;
      entry.qr = null;
      entry.status = "connected";
      console.log("[SESSION READY]", sessionId, entry.phone ?? "unknown", new Date().toISOString());
    });

    client.on("auth_failure", (message) => {
      console.warn("[SESSION START]", sessionId, "auth_failure", message);
      entry.status = "disconnected";
      entry.qr = null;
    });

    client.on("disconnected", (reason) => {
      console.warn("[SESSION CLEANUP]", sessionId, "disconnected event", reason);
      entry.status = "disconnected";
      entry.phone = undefined;
      entry.qr = null;
    });

    try {
      await client.initialize();
    } catch (error) {
      console.error("[SESSION START]", sessionId, "initialize failed", String(error));
      clients.delete(sessionId);
      throw error;
    }

    return entry;
  } finally {
    startingSessions.delete(sessionId);
  }
}

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, x-api-key");
  next();
});

app.options("*", (_req, res) => res.sendStatus(204));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/start-session", async (req, res) => {
  const sessionId = sanitizeSessionId(
    String(req.body?.sessionId ?? req.body?.session ?? req.body?.name ?? "")
  );
  if (!sessionId) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return;
  }

  try {
    await startClient(sessionId);
    res.json({ success: true, started: true, ...sessionStatusPayload(sessionId) });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/logout-session", async (req, res) => {
  const sessionId = sanitizeSessionId(
    String(req.body?.sessionId ?? req.body?.session ?? req.body?.name ?? "")
  );
  if (!sessionId) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return;
  }

  console.log("[LOGOUT REQUEST]", sessionId, new Date().toISOString());

  try {
    await destroyClient(sessionId);
    res.json({ success: true, ok: true, sessionId });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

function respondSessionStatus(sessionId, res) {
  res.json(sessionStatusPayload(sessionId));
}

app.get("/api/session-status", (req, res) => {
  const sessionId = sanitizeSessionId(String(req.query.sessionId ?? ""));
  if (!sessionId) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return;
  }
  respondSessionStatus(sessionId, res);
});

app.get("/api/session-info/:sessionId", (req, res) => {
  const sessionId = sanitizeSessionId(String(req.params.sessionId ?? ""));
  if (!sessionId) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return;
  }
  respondSessionStatus(sessionId, res);
});

app.get("/api/session-info", (req, res) => {
  const sessionId = sanitizeSessionId(String(req.query.sessionId ?? ""));
  if (!sessionId) {
    res.status(400).json({ success: false, message: "sessionId is required" });
    return;
  }
  respondSessionStatus(sessionId, res);
});

app.use((_req, res) => {
  res.status(404).json({ message: "Not found" });
});

ensureAuthRoot();
http.createServer(app).listen(PORT, () => {
  console.log(`whatsapp-web.js bridge listening on http://localhost:${PORT}`);
  console.log("Auth root:", AUTH_ROOT);
});
