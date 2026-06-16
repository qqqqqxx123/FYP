/**
 * One-time cleanup for legacy WhatsApp connection rows in NocoDB.
 *
 * - Marks slot-based rows (User_ID 1/2, SessionID 1/2, Slot column) as disconnected
 * - Migrates email-based SessionID rows to user_{id}_whatsapp_1 format
 * - Optionally deletes legacy rows with --delete
 *
 * Usage:
 *   node scripts/migrate-whatsapp-connections.mjs
 *   node scripts/migrate-whatsapp-connections.mjs --delete
 *   node scripts/migrate-whatsapp-connections.mjs --dry-run
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const shouldDelete = args.has("--delete");

const WHATSAPP_SESSION_SUFFIX = "_whatsapp_1";

function getBaseUrl() {
  const url = process.env.NOCODB_BASE_URL;
  if (!url) throw new Error("NOCODB_BASE_URL is not set");
  return url.replace(/\/$/, "");
}

function getApiToken() {
  const token = process.env.NOCODB_API_TOKEN;
  if (!token) throw new Error("NOCODB_API_TOKEN is not set");
  return token;
}

function getConnectionSessionId(row) {
  const sessionId = row.SessionID ?? row.SessionId ?? row.sessionId;
  return sessionId != null ? String(sessionId).trim() : "";
}

function getConnectionUserId(row) {
  const userId = row.User_ID ?? row.user_id;
  return userId != null ? String(userId).trim().toLowerCase() : "";
}

function isLegacyRow(row) {
  const userId = getConnectionUserId(row);
  const sessionId = getConnectionSessionId(row);
  if (userId === "1" || userId === "2") return true;
  if (sessionId === "1" || sessionId === "2") return true;
  if (row.Slot != null && String(row.Slot).trim() !== "") return true;
  return false;
}

function parseUserIdFromSessionId(sessionId) {
  const trimmed = sessionId.trim();
  if (!trimmed.startsWith("user_") || !trimmed.endsWith(WHATSAPP_SESSION_SUFFIX)) return null;
  return trimmed.slice("user_".length, trimmed.length - WHATSAPP_SESSION_SUFFIX.length) || null;
}

function buildUserWhatsAppSessionId(userId) {
  const normalized = String(userId).trim().replace(/[^\w-]/g, "");
  return `user_${normalized}${WHATSAPP_SESSION_SUFFIX}`;
}

async function getTableCandidates(baseUrl, token, baseId) {
  const configured = process.env.NOCODB_WHATSAPP_CONNECTIONS_TABLE_ID?.trim();
  const candidates = [];
  if (configured) candidates.push(configured);
  candidates.push("Connect_whatsapp", "WhatsApp_Connections");
  return [...new Set(candidates.filter(Boolean))];
}

async function fetchRows(baseUrl, token, baseId, tableIdOrName) {
  const paths = [
    `/api/v2/tables/${tableIdOrName}/records?limit=500`,
    ...(baseId
      ? [
          `/api/v1/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
          `/api/v2/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
        ]
      : []),
  ];
  const headers = { "xc-token": token, "Content-Type": "application/json" };

  for (const path of paths) {
    const res = await fetch(`${baseUrl}${path}`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    return data?.list ?? [];
  }
  return null;
}

async function findUserIdByEmail(baseUrl, token, baseId, email) {
  const tables = [process.env.NOCODB_USERS_TABLE_ID?.trim(), "Users"].filter(Boolean);
  const where = `(Email,eq,${email})`;
  const headers = { "xc-token": token, "Content-Type": "application/json" };

  for (const table of tables) {
    for (const path of [
      `/api/v2/tables/${table}/records?limit=1&where=${encodeURIComponent(where)}`,
      ...(baseId
        ? [`/api/v2/db/data/noco/${baseId}/${table}?limit=1&where=${encodeURIComponent(where)}`]
        : []),
    ]) {
      const res = await fetch(`${baseUrl}${path}`, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const row = (data?.list ?? [])[0];
      if (row?.Id != null) return String(row.Id);
    }
  }
  return null;
}

async function patchRow(baseUrl, token, tableIdOrName, payload) {
  const res = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records`, {
    method: "PATCH",
    headers: { "xc-token": token, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

async function deleteRow(baseUrl, token, tableIdOrName, id) {
  const res = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records`, {
    method: "DELETE",
    headers: { "xc-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ Id: id }),
  });
  return res.ok;
}

async function main() {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  const tableCandidates = await getTableCandidates(baseUrl, token, baseId);

  let rows = null;
  let tableId = null;
  for (const candidate of tableCandidates) {
    const list = await fetchRows(baseUrl, token, baseId, candidate);
    if (list) {
      rows = list;
      tableId = candidate;
      break;
    }
  }

  if (!rows || !tableId) {
    console.error("Could not load WhatsApp connection rows from NocoDB.");
    process.exit(1);
  }

  console.log(`Loaded ${rows.length} row(s) from table ${tableId}`);
  if (dryRun) console.log("DRY RUN — no changes will be written.\n");

  let legacyUpdated = 0;
  let migrated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = row.Id;
    if (id == null) {
      skipped++;
      continue;
    }

    if (isLegacyRow(row)) {
      console.log(`Legacy slot row Id=${id} User_ID=${getConnectionUserId(row)} SessionID=${getConnectionSessionId(row)}`);
      if (shouldDelete) {
        if (!dryRun) await deleteRow(baseUrl, token, tableId, id);
        deleted++;
      } else {
        if (!dryRun) {
          await patchRow(baseUrl, token, tableId, {
            Id: id,
            Status: "disconnected",
            Phone_Number: null,
            Whatsapp_Number: null,
            Last_Updated: new Date().toISOString(),
          });
        }
        legacyUpdated++;
      }
      continue;
    }

    const sessionId = getConnectionSessionId(row);
    const embedded = parseUserIdFromSessionId(sessionId);
    if (!embedded?.includes("@")) {
      skipped++;
      continue;
    }

    const userId = await findUserIdByEmail(baseUrl, token, baseId, embedded.toLowerCase());
    if (!userId) {
      console.warn(`Could not resolve user id for email session ${sessionId} (row Id=${id})`);
      skipped++;
      continue;
    }

    const newSessionId = buildUserWhatsAppSessionId(userId);
    console.log(`Migrate row Id=${id}: ${sessionId} -> ${newSessionId}, User_ID=${userId}`);
    if (!dryRun) {
      await patchRow(baseUrl, token, tableId, {
        Id: id,
        User_ID: userId,
        SessionID: newSessionId,
        Last_Updated: new Date().toISOString(),
      });
    }
    migrated++;
  }

  console.log("\nDone.");
  console.log(`Legacy rows ${shouldDelete ? "deleted" : "disconnected"}: ${shouldDelete ? deleted : legacyUpdated}`);
  console.log(`Email SessionID rows migrated: ${migrated}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
