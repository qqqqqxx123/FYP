/**
 * NocoDB client for Montresor Infni CRM.
 * - Auth: validate login against your Users table (Username + encoded Password).
 * - Uses NocoDB Data API with xc-token to read Users table.
 */

import { formatHongKongDateTime } from "@/lib/format-datetime";
import {
  normalizeWhatsAppUserIdPart,
  parseUserIdFromSessionId,
  parseWhatsAppSlotFromSessionId,
} from "@/lib/whatsapp-session-id";

const getBaseUrl = () => {
  const url = process.env.NOCODB_BASE_URL;
  if (!url) throw new Error("NOCODB_BASE_URL is not set");
  return url.replace(/\/$/, "");
};

const getApiToken = () => {
  const token = process.env.NOCODB_API_TOKEN;
  if (!token) throw new Error("NOCODB_API_TOKEN is not set");
  return token;
};

/** Your Users table record shape (column titles as in NocoDB). */
export interface CrmUserRecord {
  Id?: number;
  Username?: string;
  Email?: string;
  Password?: string;
  "Display name"?: string;
  Admin?: boolean | number | string;
  role?: string;
  "Is Active"?: boolean;
  "Last Login At"?: string | null;
  [key: string]: unknown;
}

function parseUserList(data: unknown): CrmUserRecord[] {
  if (!data || typeof data !== "object") return [];
  const record = data as {
    list?: CrmUserRecord[];
    data?: CrmUserRecord[];
    records?: CrmUserRecord[];
  };
  return record.list ?? record.data ?? record.records ?? [];
}

async function getUsersTableCandidates(
  baseUrl: string,
  token: string,
  baseId: string | undefined
): Promise<string[]> {
  const configured = process.env.NOCODB_USERS_TABLE_ID?.trim();
  const candidates: string[] = [];
  if (configured) candidates.push(configured);
  candidates.push("Users");

  if (!baseId) return Array.from(new Set(candidates.filter(Boolean)));

  try {
    const res = await fetch(`${baseUrl}/api/v2/meta/bases/${baseId}/tables`, {
      headers: { "xc-token": token, "Content-Type": "application/json" },
    });
    if (!res.ok) return Array.from(new Set(candidates.filter(Boolean)));

    const data = (await res.json()) as {
      list?: Array<{ id?: string; table_name?: string; title?: string }>;
    };
    const tables = data.list ?? [];

    if (configured?.toLowerCase().startsWith("vw")) {
      for (const table of tables) {
        if (!table.id) continue;
        try {
          const viewRes = await fetch(`${baseUrl}/api/v2/meta/tables/${table.id}/views`, {
            headers: { "xc-token": token, "Content-Type": "application/json" },
          });
          if (!viewRes.ok) continue;
          const viewData = (await viewRes.json()) as {
            list?: Array<{ id?: string; fk_model_id?: string; fk_modelId?: string }>;
          };
          const matchedView = (viewData.list ?? []).find(
            (view) => String(view.id ?? "").trim() === configured
          );
          if (!matchedView) continue;
          const modelId = String(
            matchedView.fk_model_id ?? matchedView.fk_modelId ?? table.id
          ).trim();
          if (modelId) candidates.unshift(modelId);
          if (table.id) candidates.unshift(table.id);
          break;
        } catch {
          continue;
        }
      }
    }

    const usersTable = tables.find((table) => {
      const title = String(table.title ?? table.table_name ?? "").toLowerCase();
      return title === "users" || table.table_name === "Users";
    });
    if (usersTable?.id) candidates.push(usersTable.id);
    if (usersTable?.table_name) candidates.push(usersTable.table_name);
  } catch {
    // metadata discovery is optional
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function buildUsersRecordPaths(
  baseId: string,
  tableIdOrName: string,
  qs: string
): string[] {
  return [
    `/api/v2/tables/${tableIdOrName}/records?${qs}`,
    `/api/v2/db/data/noco/${baseId}/${tableIdOrName}?${qs}`,
    `/api/v1/db/data/noco/${baseId}/${tableIdOrName}?${qs}`,
  ];
}

async function findUserByField(
  field: string,
  value: string
): Promise<CrmUserRecord | null> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  if (!baseId) throw new Error("NOCODB_BASE_ID must be set in .env.local");

  const tableCandidates = await getUsersTableCandidates(baseUrl, token, baseId);
  const where = `(${field},eq,${value})`;
  const qs = `limit=1&where=${encodeURIComponent(where)}`;

  for (const tableIdOrName of tableCandidates) {
    for (const path of buildUsersRecordPaths(baseId, tableIdOrName, qs)) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: {
            "xc-token": token,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const data = await res.json();
        const list = parseUserList(data);
        if (list[0]) return list[0];
      } catch {
        continue;
      }
    }
  }

  return null;
}

/** True when Users table Admin column is "Y" (empty = not admin). */
export function isUserAdmin(user: CrmUserRecord | null | undefined): boolean {
  if (!user) return false;

  const adminField = user.Admin;
  if (adminField == null || adminField === "") return false;
  if (typeof adminField === "boolean") return adminField;
  if (typeof adminField === "number") return adminField === 1;

  const value = String(adminField).trim().toUpperCase();
  return value === "Y";
}

/** Your Clients table record shape (column titles as in NocoDB). */
export interface ClientRecord {
  "Client ID"?: string;
  Client_ID?: string;
  Name?: string;
  Whatsapp_number?: string;
  Gender?: string;
  DOB?: string;
  Tags?: string;
  Purchase_Date?: string;
  "Purchase Date"?: string;
  Purchase_Amount?: number | string;
  "Purchase Amount"?: number | string;
  [key: string]: unknown;
}

/**
 * Fetch user by Username from your NocoDB Users table.
 * Requires NOCODB_BASE_ID and NOCODB_USERS_TABLE_ID (or table name "Users").
 */
export async function findUserByUsername(
  username: string
): Promise<CrmUserRecord | null> {
  return findUserByField("Username", username);
}

/** Look up a user by Username or Email (login identifier). */
export async function findUserByEmailOrUsername(
  identifier: string
): Promise<CrmUserRecord | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) return null;

  const byUsername = await findUserByField("Username", normalized).catch(() => null);
  if (byUsername) return byUsername;

  const byEmail = await findUserByField("Email", normalized).catch(() => null);
  if (byEmail) return byEmail;

  return null;
}

/** Check whether the given login identifier belongs to an admin user. */
export async function isAdminUserByIdentifier(identifier: string): Promise<boolean> {
  const user = await findUserByEmailOrUsername(identifier).catch(() => null);
  return isUserAdmin(user);
}

export type UserLoginStatus = "online" | "offline" | "never";

export interface AdminUserListItem {
  id: string;
  username: string;
  createdAt: string;
  email: string;
  displayName: string;
  admin: string;
  isActive: string;
  lastLoginAt: string;
  loginStatus: UserLoginStatus;
}

export interface AdminUserTableItem extends AdminUserListItem {
  whatsappConnectedCount: number;
  whatsappConnectedPhones: string[];
}

const USERS_PAGE_SIZE = 100;
const USERS_MAX_PAGES = 50;

function formatAdminValue(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).trim().toUpperCase() === "Y" ? "Y" : String(value).trim();
}

function formatActiveValue(value: unknown): string {
  if (value === true || value === 1) return "Yes";
  if (value === false || value === 0) return "No";
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return "Yes";
    if (normalized === "false" || normalized === "no" || normalized === "0") return "No";
    return value.trim();
  }
  return "";
}

function formatLoginStatus(value: unknown): UserLoginStatus {
  if (value == null || String(value).trim() === "") return "never";
  const normalized = String(value).trim().toUpperCase();
  if (normalized === "Y") return "online";
  if (normalized === "N") return "offline";
  return "never";
}

function mapUserRecord(record: CrmUserRecord): AdminUserListItem {
  const id = record.Id ?? (record as { id?: number }).id;
  const username = String(record.Username ?? "").trim();
  const emailField = String(record.Email ?? "").trim();
  const email = emailField || (username.includes("@") ? username : "");
  return {
    id: id != null ? String(id) : "",
    username,
    createdAt: formatHongKongDateTime(record.CreatedAt ?? record.created_at),
    email,
    displayName: String(
      record["Display name"] ?? record.DisplayName ?? record.Display_name ?? username
    ).trim(),
    admin: formatAdminValue(record.Admin),
    isActive: formatActiveValue(
      record["Is Active"] ?? record.Is_Active ?? record.Valid
    ),
    lastLoginAt: formatHongKongDateTime(
      record["Last Login At"] ??
        record.Last_Login_At ??
        record.last_login_time
    ),
    loginStatus: formatLoginStatus(
      record.Is_login ?? record.Is_Login ?? record.is_login
    ),
  };
}

/** List all users from the NocoDB Users table (password excluded). */
export async function listUsersFromNocoDB(): Promise<AdminUserListItem[]> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  if (!baseId) throw new Error("NOCODB_BASE_ID must be set in .env.local");

  const tableCandidates = await getUsersTableCandidates(baseUrl, token, baseId);
  const headers = {
    "xc-token": token,
    "Content-Type": "application/json",
  };

  for (const tableIdOrName of tableCandidates) {
    const allRows: CrmUserRecord[] = [];
    let offset = 0;

    for (let page = 0; page < USERS_MAX_PAGES; page++) {
      const qs = `limit=${USERS_PAGE_SIZE}&offset=${offset}`;
      let list: CrmUserRecord[] = [];

      for (const path of buildUsersRecordPaths(baseId, tableIdOrName, qs)) {
        try {
          const res = await fetch(`${baseUrl}${path}`, { headers, cache: "no-store" });
          if (!res.ok) continue;
          const data = await res.json();
          list = parseUserList(data);
          if (list.length > 0) break;
        } catch {
          continue;
        }
      }

      allRows.push(...list);
      if (list.length < USERS_PAGE_SIZE) break;
      offset += list.length;
    }

    if (allRows.length > 0) {
      return allRows
        .map(mapUserRecord)
        .filter((user) => user.id || user.username || user.email);
    }
  }

  return [];
}

function parseRecordId(userId: string): string | number {
  const trimmed = userId.trim();
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

/** Update a user row in the NocoDB Users table. */
export async function updateUserInNocoDB(
  userId: string,
  fields: { username: string; password?: string }
): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  if (!baseId) throw new Error("NOCODB_BASE_ID must be set in .env.local");

  const username = fields.username.trim();
  if (!username) throw new Error("Username is required");

  const tableCandidates = await getUsersTableCandidates(baseUrl, token, baseId);
  const recordId = parseRecordId(userId);
  const payload: Record<string, unknown> = { Id: recordId, Username: username };
  if (fields.password?.trim()) payload.Password = fields.password.trim();
  const headers = {
    "xc-token": token,
    "Content-Type": "application/json",
  };

  let lastError: Error | null = null;
  for (const tableIdOrName of tableCandidates) {
    const paths = [
      `/api/v2/tables/${tableIdOrName}/records`,
      `/api/v2/db/data/noco/${baseId}/${tableIdOrName}`,
      `/api/v1/db/data/noco/${baseId}/${tableIdOrName}`,
    ];

    for (const path of paths) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        if (res.ok) return;
        const errBody = await res.json().catch(() => ({}));
        const msg = (errBody as { message?: string; msg?: string })?.message
          ?? (errBody as { msg?: string })?.msg
          ?? res.statusText;
        lastError = new Error(msg || `Update failed: ${res.status}`);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  throw lastError ?? new Error("Failed to update user");
}

/** Delete a user row from the NocoDB Users table. */
export async function deleteUserFromNocoDB(userId: string): Promise<void> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  if (!baseId) throw new Error("NOCODB_BASE_ID must be set in .env.local");

  const tableCandidates = await getUsersTableCandidates(baseUrl, token, baseId);
  const recordId = parseRecordId(userId);
  const headers = {
    "xc-token": token,
    "Content-Type": "application/json",
  };

  let lastError: Error | null = null;
  for (const tableIdOrName of tableCandidates) {
    const attempts: Array<{ method: "DELETE"; path: string; body?: string }> = [
      { method: "DELETE", path: `/api/v2/tables/${tableIdOrName}/records/${recordId}` },
      {
        method: "DELETE",
        path: `/api/v2/tables/${tableIdOrName}/records`,
        body: JSON.stringify([{ Id: recordId }]),
      },
    ];

    if (baseId) {
      attempts.push(
        {
          method: "DELETE",
          path: `/api/v2/db/data/noco/${baseId}/${tableIdOrName}/${recordId}`,
        },
        {
          method: "DELETE",
          path: `/api/v2/db/data/noco/${baseId}/${tableIdOrName}`,
          body: JSON.stringify([{ Id: recordId }]),
        }
      );
    }

    for (const attempt of attempts) {
      try {
        const res = await fetch(`${baseUrl}${attempt.path}`, {
          method: "DELETE",
          headers,
          body: attempt.body,
          cache: "no-store",
        });
        if (res.ok) return;
        const errBody = await res.json().catch(() => ({}));
        const msg = (errBody as { message?: string; msg?: string })?.message
          ?? (errBody as { msg?: string })?.msg
          ?? res.statusText;
        lastError = new Error(msg || `Delete failed: ${res.status}`);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  throw lastError ?? new Error("Failed to delete user");
}

/** Map our ClientRecord keys to NocoDB column names (API expects these). */
const clientRecordToNocoDB: Record<string, string> = {
  "Client ID": "Client_ID",
  Client_ID: "Client_ID",
  Name: "Name",
  Whatsapp_number: "Whatsapp_number",
  Gender: "Gender",
  DOB: "DOB",
  Tags: "Tags",
  "Purchase Date": "Purchase_Date",
  Purchase_Date: "Purchase_Date",
  "Purchase Amount": "Purchase_Amount",
  Purchase_Amount: "Purchase_Amount",
};

function toNocoDBPayload(record: ClientRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === "") continue;
    const col = clientRecordToNocoDB[key] ?? key;
    out[col] = value;
  }
  return out;
}

/** Normalize WhatsApp number for duplicate check (digits only, no spaces). */
function normalizeWhatsAppForCompare(value: string): string {
  return (value ?? "").replace(/\D/g, "").trim();
}

/**
 * Fetch all existing WhatsApp numbers from the Clients table (for duplicate detection).
 * Uses same Tables API as GET /api/clients.
 */
export async function getExistingClientWhatsAppNumbers(): Promise<Set<string>> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const tableIdOrName = process.env.NOCODB_CLIENTS_TABLE_ID ?? "Clients";

  const url = `${baseUrl}/api/v2/tables/${tableIdOrName}/records?limit=10000&pageSize=500`;
  const res = await fetch(url, {
    headers: {
      "xc-token": token,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return new Set();

  const data = (await res.json()) as {
    list?: Array<Record<string, unknown>>;
    pageInfo?: { totalRows?: number; pageSize?: number };
  };
  const list = data?.list ?? [];
  const set = new Set<string>();
  const getNum = (row: Record<string, unknown>) =>
    String(row.Whatsapp_number ?? row["Whatsapp number"] ?? "").trim();
  for (const row of list) {
    const num = getNum(row as Record<string, unknown>);
    if (num) set.add(normalizeWhatsAppForCompare(num));
  }

  const pageInfo = data?.pageInfo;
  if (pageInfo?.totalRows != null && pageInfo?.pageSize != null && list.length < pageInfo.totalRows) {
    const pageSize = pageInfo.pageSize;
    for (let offset = pageSize; offset < pageInfo.totalRows; offset += pageSize) {
      const nextRes = await fetch(
        `${baseUrl}/api/v2/tables/${tableIdOrName}/records?limit=${pageSize}&offset=${offset}`,
        { headers: { "xc-token": token, "Content-Type": "application/json" }, cache: "no-store" }
      );
      if (!nextRes.ok) break;
      const nextData = (await nextRes.json()) as { list?: Array<Record<string, unknown>> };
      const nextList = nextData?.list ?? [];
      if (nextList.length === 0) break;
      for (const row of nextList) {
        const num = getNum(row);
        if (num) set.add(normalizeWhatsAppForCompare(num));
      }
    }
  }

  return set;
}

/**
 * Create client records in the Clients table.
 * NocoDB expects one record per POST; we send each record in its own request.
 * Tries Tables API first (same as GET /api/clients), then Data API.
 * Requires NOCODB_CLIENTS_TABLE_ID (or "Clients"). NOCODB_BASE_ID only for Data API fallback.
 */
export async function createClients(
  records: ClientRecord[]
): Promise<{ inserted: number }> {
  if (!records.length) return { inserted: 0 };
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  const tableIdOrName = process.env.NOCODB_CLIENTS_TABLE_ID ?? "Clients";

  const pathsToTry: string[] = [
    `/api/v2/tables/${tableIdOrName}/records`,
  ];
  if (baseId) {
    pathsToTry.push(
      `/api/v2/db/data/noco/${baseId}/${tableIdOrName}`,
      `/api/v1/db/data/noco/${baseId}/${tableIdOrName}`,
      `/api/v2/db/data/v2/${baseId}/${tableIdOrName}`,
    );
  }

  async function postOneRecord(
    path: string,
    record: ClientRecord
  ): Promise<boolean> {
    const body = JSON.stringify(toNocoDBPayload(record));
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "xc-token": token,
        "Content-Type": "application/json",
      },
      body,
    });
    if (res.ok) return true;
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { message?: string })?.message ?? res.statusText;
    throw new Error(msg || `Request failed: ${res.status}`);
  }

  let lastError: Error | null = null;
  for (const path of pathsToTry) {
    let inserted = 0;
    try {
      for (const record of records) {
        await postOneRecord(path, record);
        inserted += 1;
      }
      return { inserted };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("Failed to create clients");
}

/** WhatsApp connection row stored in NocoDB (Connect_whatsapp table). */
export interface WhatsAppConnectionRecord {
  Id?: number;
  Slot?: number | string;
  SessionID?: string;
  SessionId?: string;
  Phone_Number?: string;
  Whatsapp_Number?: string | number;
  User_ID?: string | number;
  Status?: string;
  Last_Updated?: string;
  Last_Connect_Time?: string;
  [key: string]: unknown;
}

export interface UserWhatsAppConnection {
  rowId?: number;
  userId: string;
  sessionId: string;
  phone?: string;
  status?: string;
  lastConnectTime?: string;
}

export interface AdminUserWhatsAppSummary {
  connectedCount: number;
  connectedPhones: string[];
}

function normalizePhoneForDisplay(input: unknown): string | undefined {
  if (input == null) return undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return `+${digits}`;
}

function getConnectionSessionId(row: WhatsAppConnectionRecord): string {
  const sessionId = row.SessionID ?? row.SessionId ?? row.sessionId;
  return sessionId != null ? String(sessionId).trim() : "";
}

function getConnectionUserId(row: WhatsAppConnectionRecord): string {
  const userId = row.User_ID ?? row.user_id;
  return userId != null ? String(userId).trim().toLowerCase() : "";
}

/** True for old slot-based or placeholder rows that should not block new connections. */
export function isLegacyWhatsAppConnectionRow(row: WhatsAppConnectionRecord): boolean {
  const userId = getConnectionUserId(row);
  const sessionId = getConnectionSessionId(row);
  if (userId === "1" || userId === "2") return true;
  if (sessionId === "1" || sessionId === "2") return true;
  if (row.Slot != null && String(row.Slot).trim() !== "") return true;
  if (sessionId.includes("@")) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolve NocoDB Users table Id from a login identifier (numeric id, email, or username). */
export async function resolveNocoDbUserId(
  identifier: string,
  retries = 3
): Promise<string | null> {
  const normalized = identifier.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return normalized;

  for (let attempt = 0; attempt < retries; attempt++) {
    const user = await findUserByEmailOrUsername(normalized).catch(() => null);
    if (user?.Id != null) return String(user.Id);
    if (attempt < retries - 1) await sleep(250 * (attempt + 1));
  }

  return null;
}

function mapWhatsAppConnectionRow(row: WhatsAppConnectionRecord): UserWhatsAppConnection | null {
  const userId = getConnectionUserId(row);
  const sessionId = getConnectionSessionId(row);
  if (!userId && !sessionId) return null;

  const phoneRaw = row.Phone_Number ?? row.Whatsapp_Number;
  return {
    rowId: row.Id,
    userId,
    sessionId,
    phone: normalizePhoneForDisplay(phoneRaw),
    status: row.Status ? String(row.Status) : undefined,
    lastConnectTime: row.Last_Connect_Time ? String(row.Last_Connect_Time) : undefined,
  };
}

const DEFAULT_WHATSAPP_CONNECTION_TABLES = ["Connect_whatsapp", "WhatsApp_Connections"] as const;

async function getWhatsAppConnectionsTableCandidates(
  baseUrl: string,
  token: string,
  baseId: string | undefined
): Promise<string[]> {
  const configured = process.env.NOCODB_WHATSAPP_CONNECTIONS_TABLE_ID?.trim()
  const candidates: string[] = []
  if (configured) candidates.push(configured)
  candidates.push(...DEFAULT_WHATSAPP_CONNECTION_TABLES)
  if (baseId) {
    try {
      const res = await fetch(`${baseUrl}/api/v2/meta/bases/${baseId}/tables`, {
        headers: { "xc-token": token, "Content-Type": "application/json" },
      })
      if (res.ok) {
        const data = (await res.json()) as {
          list?: Array<{ id?: string; table_name?: string; title?: string }>
        }
        const tables = data.list ?? []
        if (configured?.toLowerCase().startsWith("vw")) {
          for (const table of tables) {
            if (!table.id) continue
            try {
              const viewRes = await fetch(`${baseUrl}/api/v2/meta/tables/${table.id}/views`, {
                headers: { "xc-token": token, "Content-Type": "application/json" },
              })
              if (!viewRes.ok) continue
              const viewData = (await viewRes.json()) as {
                list?: Array<{ id?: string; fk_model_id?: string; fk_modelId?: string }>
              }
              const matchedView = (viewData.list ?? []).find(
                (view) => String(view.id ?? "").trim() === configured
              )
              if (!matchedView) continue
              const modelId = String(
                matchedView.fk_model_id ?? matchedView.fk_modelId ?? table.id
              ).trim()
              if (modelId) candidates.unshift(modelId)
              if (table.id) candidates.unshift(table.id)
              break
            } catch {
              continue
            }
          }
        }
        const matched = (data.list ?? []).filter((table) => {
          const title = String(table.title ?? table.table_name ?? "").toLowerCase()
          return title.includes("whatsapp") && (title.includes("connect") || title.includes("connection"))
        })
        for (const table of matched) {
          if (table.id) candidates.push(table.id)
          if (table.table_name) candidates.push(table.table_name)
          if (table.title) candidates.push(table.title)
        }
      }
    } catch {
      // metadata discovery is optional
    }
  }
  return Array.from(new Set(candidates.filter(Boolean)))
}

async function fetchWhatsAppConnectionRows(): Promise<WhatsAppConnectionRecord[]> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  const tableCandidates = await getWhatsAppConnectionsTableCandidates(baseUrl, token, baseId);

  for (const tableIdOrName of tableCandidates) {
    const pathsToTry = [
      `/api/v2/tables/${tableIdOrName}/records?limit=500`,
      ...(baseId
        ? [
            `/api/v1/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
            `/api/v2/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
          ]
        : []),
    ];

    for (const path of pathsToTry) {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: {
            "xc-token": token,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) continue;
        const data = (await res.json()) as { list?: WhatsAppConnectionRecord[] };
        return data?.list ?? [];
      } catch {
        continue;
      }
    }
  }

  return [];
}

function connectionBelongsToUser(row: WhatsAppConnectionRecord, userId: string): boolean {
  const normalizedUserId = userId.trim().toLowerCase();
  const normalizedIdPart = normalizeWhatsAppUserIdPart(userId);
  const rowUserId = getConnectionUserId(row);
  if (rowUserId === normalizedUserId) return true;

  const sessionId = getConnectionSessionId(row);
  const ownerId = parseUserIdFromSessionId(sessionId);
  return ownerId === normalizedIdPart;
}

/** Get all WhatsApp connections for a specific user. */
export async function listWhatsAppConnectionsForUser(
  userId: string
): Promise<UserWhatsAppConnection[]> {
  const list = await fetchWhatsAppConnectionRows();

  return list
    .filter((row) => !isLegacyWhatsAppConnectionRow(row) && connectionBelongsToUser(row, userId))
    .map((row) => mapWhatsAppConnectionRow(row))
    .filter((connection): connection is UserWhatsAppConnection => connection !== null)
    .sort(
      (a, b) =>
        parseWhatsAppSlotFromSessionId(a.sessionId) - parseWhatsAppSlotFromSessionId(b.sessionId)
    );
}

function resolveWhatsAppConnectionOwnerUserId(connection: UserWhatsAppConnection): string {
  const explicitUserId = connection.userId.trim();
  if (/^\d+$/.test(explicitUserId)) return explicitUserId;

  const fromSession = parseUserIdFromSessionId(connection.sessionId);
  return fromSession?.trim() || explicitUserId;
}

/** Connected WhatsApp accounts grouped by Users table Id (for admin views). */
export async function listWhatsAppConnectionSummariesByUserId(): Promise<
  Record<string, AdminUserWhatsAppSummary>
> {
  const list = await fetchWhatsAppConnectionRows();
  const summaries = new Map<string, { phones: string[]; seenSessions: Set<string> }>();

  for (const row of list) {
    if (isLegacyWhatsAppConnectionRow(row)) continue;

    const connection = mapWhatsAppConnectionRow(row);
    if (!connection) continue;

    const status = (connection.status ?? "").trim().toLowerCase();
    if (status !== "connected") continue;

    const ownerId = normalizeWhatsAppUserIdPart(resolveWhatsAppConnectionOwnerUserId(connection));
    if (!ownerId) continue;

    const entry = summaries.get(ownerId) ?? { phones: [], seenSessions: new Set<string>() };
    if (entry.seenSessions.has(connection.sessionId)) continue;

    entry.seenSessions.add(connection.sessionId);
    if (connection.phone) entry.phones.push(connection.phone);
    summaries.set(ownerId, entry);
  }

  const result: Record<string, AdminUserWhatsAppSummary> = {};
  for (const [userId, entry] of summaries) {
    result[userId] = {
      connectedCount: entry.seenSessions.size,
      connectedPhones: entry.phones,
    };
  }

  return result;
}

/** Get the WhatsApp connection for a specific user. */
export async function getWhatsAppConnectionForUser(
  userId: string,
  sessionId?: string
): Promise<UserWhatsAppConnection | null> {
  const connections = await listWhatsAppConnectionsForUser(userId);
  if (sessionId?.trim()) {
    return connections.find((item) => item.sessionId === sessionId.trim()) ?? null;
  }

  return connections[0] ?? null;
}

/** Find a WhatsApp connection by Bailey bridge SessionID. */
export async function findWhatsAppConnectionBySessionId(
  sessionId: string
): Promise<UserWhatsAppConnection | null> {
  const normalizedSessionId = sessionId.trim();
  const list = await fetchWhatsAppConnectionRows();

  const row = list.find((item) => getConnectionSessionId(item) === normalizedSessionId);
  if (!row) return null;
  return mapWhatsAppConnectionRow(row);
}

/** Return another user's id if the phone is already connected elsewhere. */
export async function findConnectedUserByWhatsAppPhone(
  phone: string,
  excludeUserId?: string
): Promise<string | null> {
  const digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return null;

  const exclude = excludeUserId?.trim().toLowerCase() ?? "";
  const list = await fetchWhatsAppConnectionRows();

  for (const row of list) {
    if (isLegacyWhatsAppConnectionRow(row)) continue;
    const rowUserId = getConnectionUserId(row);
    if (!rowUserId || rowUserId === exclude) continue;
    if (String(row.Status ?? "").toLowerCase() !== "connected") continue;

    const rowDigits = String(row.Phone_Number ?? row.Whatsapp_Number ?? "").replace(/[^\d]/g, "");
    if (rowDigits && rowDigits === digits) return rowUserId;
  }

  return null;
}

/**
 * Upsert one user's WhatsApp connection in NocoDB (Connect_whatsapp table).
 */
export async function upsertWhatsAppConnectionForUser(
  userId: string,
  sessionId: string,
  phone: string | null,
  status: "connected" | "disconnected"
): Promise<void> {
  const { assertWhatsAppPhoneAvailableForUser } = await import("@/lib/whatsapp-connection");
  await assertWhatsAppPhoneAvailableForUser(userId, phone, status);

  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  const tableCandidates = await getWhatsAppConnectionsTableCandidates(baseUrl, token, baseId);
  const normalizedUserId = userId.trim().toLowerCase();
  const normalizedSessionId = sessionId.trim();
  let hasUpserted = false;

  for (const tableIdOrName of tableCandidates) {
    try {
      let listRes = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records?limit=500`, {
        headers: { "xc-token": token, "Content-Type": "application/json" },
      });
      if (!listRes.ok && baseId) {
        listRes = await fetch(
          `${baseUrl}/api/v1/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
          { headers: { "xc-token": token, "Content-Type": "application/json" } }
        );
      }
      if (!listRes.ok) continue;

      const listData = (await listRes.json()) as { list?: WhatsAppConnectionRecord[] };
      const list = listData?.list ?? [];
      let existing = list.find((row) => getConnectionSessionId(row) === normalizedSessionId);

      if (!existing && normalizedSessionId.endsWith("_whatsapp_1")) {
        existing = list.find((row) => {
          if (!connectionBelongsToUser(row, userId)) return false;
          const rowSessionId = getConnectionSessionId(row);
          return (
            rowSessionId === normalizedSessionId ||
            rowSessionId === "1" ||
            rowSessionId === `${normalizedUserId}@whatsapp`
          );
        });
      }

      const digitsOnlyPhone = phone ? String(phone).replace(/[^\d]/g, "") : null;
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        User_ID: normalizedUserId,
        SessionID: normalizedSessionId,
        Status: status,
        Last_Updated: now,
        Last_Connect_Time: now,
      };
      payload.Phone_Number = status === "connected" && phone ? String(phone) : null;
      payload.Whatsapp_Number = status === "connected" && digitsOnlyPhone ? Number(digitsOnlyPhone) : null;

      if (existing?.Id != null) {
        const updateRes = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records`, {
          method: "PATCH",
          headers: { "xc-token": token, "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, Id: existing.Id }),
        }).catch(() => null);
        if (updateRes?.ok) {
          hasUpserted = true;
          break;
        }
      } else {
        const createRes = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records`, {
          method: "POST",
          headers: { "xc-token": token, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => null);
        if (createRes?.ok) {
          hasUpserted = true;
          break;
        }
      }
    } catch {
      continue;
    }
  }

  if (!hasUpserted) throw new Error("Failed to upsert WhatsApp connection in NocoDB");
}

/** Delete one user's WhatsApp connection row for an unused extra slot. */
export async function deleteWhatsAppConnectionForUser(
  userId: string,
  sessionId: string
): Promise<boolean> {
  const baseUrl = getBaseUrl();
  const token = getApiToken();
  const baseId = process.env.NOCODB_BASE_ID;
  const tableCandidates = await getWhatsAppConnectionsTableCandidates(baseUrl, token, baseId);
  const normalizedSessionId = sessionId.trim();
  const headers = {
    "xc-token": token,
    "Content-Type": "application/json",
  };

  for (const tableIdOrName of tableCandidates) {
    try {
      let listRes = await fetch(`${baseUrl}/api/v2/tables/${tableIdOrName}/records?limit=500`, {
        headers,
      });
      if (!listRes.ok && baseId) {
        listRes = await fetch(
          `${baseUrl}/api/v1/db/data/noco/${baseId}/${tableIdOrName}?limit=500`,
          { headers }
        );
      }
      if (!listRes.ok) continue;

      const listData = (await listRes.json()) as { list?: WhatsAppConnectionRecord[] };
      const existing = (listData?.list ?? []).find(
        (row) =>
          connectionBelongsToUser(row, userId) &&
          getConnectionSessionId(row) === normalizedSessionId
      );
      if (!existing?.Id) continue;

      const recordId = existing.Id;
      const attempts: Array<{ path: string; body?: string }> = [
        { path: `/api/v2/tables/${tableIdOrName}/records/${recordId}` },
        {
          path: `/api/v2/tables/${tableIdOrName}/records`,
          body: JSON.stringify([{ Id: recordId }]),
        },
      ];

      if (baseId) {
        attempts.push(
          { path: `/api/v2/db/data/noco/${baseId}/${tableIdOrName}/${recordId}` },
          {
            path: `/api/v2/db/data/noco/${baseId}/${tableIdOrName}`,
            body: JSON.stringify([{ Id: recordId }]),
          }
        );
      }

      for (const attempt of attempts) {
        const res = await fetch(`${baseUrl}${attempt.path}`, {
          method: "DELETE",
          headers,
          body: attempt.body,
          cache: "no-store",
        });
        if (res.ok) return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}
