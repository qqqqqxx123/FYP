const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN =
  process.env.NOCODB_SCAM_REPORT_API_TOKEN?.trim() ||
  process.env.NOCODB_API_TOKEN;

/** NocoDB view id for User_Scam_Report (not the table id). */
const SCAM_REPORT_VIEW_ID = "vwusdpxyldy2yuzv";

const userScamEnv = process.env.NOCODB_User_Scam_Report?.trim() || "";

/** NocoDB base ID (User Scam Report workspace). */
export const SCAM_REPORT_BASE_ID =
  process.env.NOCODB_SCAM_REPORT_BASE_ID?.trim() ||
  process.env.NOCODB_BASE_ID?.trim() ||
  "";

/** NocoDB table ID for User_Scam_Report (not the view id). */
export const SCAM_REPORT_TABLE_ID =
  process.env.NOCODB_SCAM_REPORT_TABLE_ID?.trim() ||
  (userScamEnv && userScamEnv !== SCAM_REPORT_VIEW_ID ? userScamEnv : "") ||
  "mbizf5g0fbckz8v";

export interface NocoDbAttachment {
  url?: string;
  path?: string;
  signedUrl?: string;
  title?: string;
  mimetype?: string;
  size?: number;
  thumbnails?: {
    tiny?: { signedUrl?: string };
    small?: { signedUrl?: string };
    card_cover?: { signedUrl?: string };
  };
}

/** Prefer presigned URL so images load in the browser (raw S3 urls are private). */
export function resolveAttachmentDisplayUrl(value: unknown): string | undefined {
  if (!value) return undefined;

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return resolveAttachmentDisplayUrl(JSON.parse(trimmed));
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    return resolveAttachmentDisplayUrl(value[0]);
  }

  if (typeof value === "object" && value !== null) {
    const att = value as NocoDbAttachment;
    if (att.signedUrl?.trim()) return att.signedUrl.trim();
    const thumb =
      att.thumbnails?.small?.signedUrl ??
      att.thumbnails?.card_cover?.signedUrl ??
      att.thumbnails?.tiny?.signedUrl;
    if (thumb?.trim()) return thumb.trim();
    const raw = (att.url ?? att.path ?? "").trim();
    if (raw) return raw;
  }

  return undefined;
}

export function getScamReportHeaders(): Record<string, string> {
  return {
    "xc-token": NOCODB_API_TOKEN || "",
    "Content-Type": "application/json",
  };
}

export function isScamReportNocodbConfigured(): boolean {
  return Boolean(NOCODB_BASE_URL && NOCODB_API_TOKEN && SCAM_REPORT_TABLE_ID);
}

function buildV2Url(recordId?: string, query = ""): string {
  const suffix = recordId
    ? `/records/${encodeURIComponent(String(recordId))}`
    : `/records${query ? (query.startsWith("?") ? query : `?${query}`) : ""}`;
  return `${NOCODB_BASE_URL}/api/v2/tables/${SCAM_REPORT_TABLE_ID}${suffix}`;
}

function buildV1Url(recordId?: string, query = ""): string | null {
  if (!SCAM_REPORT_BASE_ID) return null;
  const q = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  if (recordId) {
    return `${NOCODB_BASE_URL}/api/v1/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}/${encodeURIComponent(String(recordId))}${q}`;
  }
  return `${NOCODB_BASE_URL}/api/v1/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}${q}`;
}

export async function fetchScamReportNocodb(
  init?: RequestInit,
  options?: { recordId?: string; query?: string }
): Promise<Response> {
  const { recordId, query = "" } = options ?? {};
  const headers = { ...getScamReportHeaders(), ...(init?.headers as Record<string, string>) };
  const requestInit: RequestInit = { ...init, headers, cache: "no-store" };

  const v2Res = await fetch(buildV2Url(recordId, query), requestInit);
  if (v2Res.ok) return v2Res;

  if (SCAM_REPORT_BASE_ID) {
    const v1Url = buildV1Url(recordId, query);
    if (v1Url) {
      const v1Res = await fetch(v1Url, requestInit);
      if (v1Res.ok) return v1Res;
    }
  }

  return v2Res;
}

export async function uploadFileToNocodbStorage(file: File): Promise<NocoDbAttachment[]> {
  if (!NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
    throw new Error("NocoDB configuration missing");
  }

  const uploadFormData = new FormData();
  uploadFormData.append("file", file);

  const uploadRes = await fetch(`${NOCODB_BASE_URL}/api/v2/storage/upload`, {
    method: "POST",
    headers: { "xc-token": NOCODB_API_TOKEN },
    body: uploadFormData,
    cache: "no-store",
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(err || "Failed to upload file to NocoDB storage");
  }

  const uploadResult = (await uploadRes.json()) as NocoDbAttachment[];
  if (!Array.isArray(uploadResult) || uploadResult.length === 0) {
    throw new Error("NocoDB storage returned no file data");
  }

  const uploaded = uploadResult[0];
  return [
    {
      url: uploaded.url || uploaded.path,
      title: uploaded.title || file.name,
      mimetype: uploaded.mimetype || file.type,
      size: uploaded.size ?? file.size,
    },
  ];
}

function normalizeAttachment(value: unknown): NocoDbAttachment[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (typeof value[0] === "object" && value[0] !== null) {
      return value as NocoDbAttachment[];
    }
  }
  if (typeof value === "string" && value.trim()) {
    return [{ url: value.trim(), title: "image" }];
  }
  return undefined;
}

function getRawAttachmentArray(row: Record<string, unknown>, ...keys: string[]): NocoDbAttachment[] | undefined {
  const findValue = (key: string): unknown => {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const match = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    return match ? row[match] : undefined;
  };

  for (const key of keys) {
    const normalized = normalizeAttachment(findValue(key));
    if (normalized) return normalized;
  }

  return undefined;
}

export function normalizeReportDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return trimmed;
}

export function buildScamReportRowPayload(input: {
  scamType: string;
  reportDate?: string;
  description?: string;
  contactDetail?: string;
  scamMessageText?: string;
  platform?: string;
  userId?: string;
  username?: string;
  status?: string;
  image1?: unknown;
  image2?: unknown;
  image3?: unknown;
  image4?: unknown;
}): Record<string, unknown> {
  const scamType = input.scamType.trim();
  const reportDate = normalizeReportDate(input.reportDate ?? "");
  const description = input.description?.trim() || "";

  const payload: Record<string, unknown> = {
    Scam_Type: scamType,
    Description: description || undefined,
    Date_of_Incident: reportDate || undefined,
    Contact_detail: input.contactDetail?.trim() || undefined,
    Scam_Message_Text: input.scamMessageText?.trim() || undefined,
    Platform: input.platform?.trim() || undefined,
    Status: input.status?.trim() || "Pending",
    User_ID: input.userId?.trim() || undefined,
    Username: input.username?.trim() || undefined,
    Image_1: normalizeAttachment(input.image1),
    Image_2: normalizeAttachment(input.image2),
    Image_3: normalizeAttachment(input.image3),
    Image_4: normalizeAttachment(input.image4),
  };

  return payload;
}

export function mapScamReportRecord(row: Record<string, unknown>) {
  const getRaw = (...keys: string[]) => getRowStringValue(row, ...keys);

  const getAttachmentUrl = (key: string): string | undefined => {
    return resolveAttachmentDisplayUrl(row[key]);
  };

  function getRecordId(r: Record<string, unknown>): unknown {
    if (r.Id !== undefined && r.Id !== null) return r.Id;
    if (r.id !== undefined && r.id !== null) return r.id;
    if (r.ID !== undefined && r.ID !== null) return r.ID;
    const key = Object.keys(r).find((k) => k.toLowerCase() === "id");
    if (key) {
      const v = r[key];
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  const rawDescription = getRaw("Description");
  const columnDate = normalizeReportDate(getRaw("Date_of_Incident", "Date of Incident"));
  const legacyParts = rawDescription.match(/^Date of Incident:\s*(.+?)\n\n([\s\S]*)$/);

  let reportDate = columnDate;
  let description = rawDescription;

  if (columnDate) {
    description = rawDescription;
  } else if (legacyParts) {
    reportDate = normalizeReportDate(legacyParts[1] ?? "");
    description = legacyParts[2]?.trim() || "";
  }

  return {
    id: getRecordId(row),
    templateName: getRaw("Scam_Type"),
    messageBody: description,
    language: getRaw("Scam_Type"),
    category: getRaw("Status"),
    region: getRaw("Platform"),
    reportDate,
    description,
    userId: getRaw("User_ID", "User Id", "user_id"),
    username: getRaw("Username", "username"),
    status: getRaw("Status"),
    platform: getRaw("Platform"),
    adminComment: getRaw("Admin_comment") || getRaw("Admin_Comment"),
    contactDetail: getRaw("Contact_detail") || getRaw("Contact_Detail"),
    scamMessageText: getRaw("Scam_Message_Text", "Scam Message Text"),
    image1: getAttachmentUrl("Image_1"),
    image2: getAttachmentUrl("Image_2"),
    image3: getAttachmentUrl("Image_3"),
    image4: getAttachmentUrl("Image_4"),
    image1Attachment: getRawAttachmentArray(row, "Image_1"),
    image2Attachment: getRawAttachmentArray(row, "Image_2"),
    image3Attachment: getRawAttachmentArray(row, "Image_3"),
    image4Attachment: getRawAttachmentArray(row, "Image_4"),
  };
}

export interface ScamReportListItem {
  id: string;
  userId: string;
  username: string;
  scamType: string;
  platform: string;
  status: string;
  reportDate: string;
  description: string;
  contactDetail: string;
  scamMessageText: string;
  adminComment: string;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
}

function mapScamReportListItem(row: Record<string, unknown>): ScamReportListItem {
  const mapped = mapScamReportRecord(row);
  return {
    id: mapped.id != null ? String(mapped.id) : "",
    userId: mapped.userId || "",
    username: mapped.username || "",
    scamType: mapped.templateName || "",
    platform: mapped.platform || mapped.region || "",
    status: mapped.status || mapped.category || "",
    reportDate: mapped.reportDate || "",
    description: mapped.description || "",
    contactDetail: mapped.contactDetail || "",
    scamMessageText: mapped.scamMessageText || "",
    adminComment: mapped.adminComment || "",
    image1: mapped.image1,
    image2: mapped.image2,
    image3: mapped.image3,
    image4: mapped.image4,
  };
}

/** List all user scam reports from NocoDB. */
export async function listScamReportsFromNocoDB(): Promise<ScamReportListItem[]> {
  if (!isScamReportNocodbConfigured()) {
    throw new Error("Scam report NocoDB is not configured");
  }

  const res = await fetchScamReportNocodb(undefined, { query: "limit=500" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Failed to load scam reports from NocoDB");
  }

  const data = (await res.json()) as
    | { list?: Record<string, unknown>[]; rows?: Record<string, unknown>[] }
    | Record<string, unknown>[];
  const list = Array.isArray(data) ? data : (data?.list ?? data?.rows ?? []);

  return list
    .map((row) => mapScamReportListItem(row as Record<string, unknown>))
    .filter((report) => report.id || report.scamType || report.username);
}

export type ScamReportStatus = "Pending" | "Approve";

function normalizeScamReportStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function isScamReportApproved(status: string): boolean {
  const normalized = normalizeScamReportStatus(status);
  return normalized === "approve" || normalized === "approved";
}

function getRowStringValue(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name];
    const extracted = extractScalarValue(value);
    if (extracted) return extracted;
  }

  const normalizedNames = new Set(names.map((name) => name.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (!normalizedNames.has(key.toLowerCase())) continue;
    const extracted = extractScalarValue(value);
    if (extracted) return extracted;
  }

  return "";
}

function extractScalarValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && !Number.isNaN(value)) return String(value);

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ["Username", "username", "Email", "email", "User_ID", "user_id", "Id", "id"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
      if (typeof nested === "number" && !Number.isNaN(nested)) return String(nested);
    }
  }

  return "";
}

export function hasScamReportOwner(report: { userId?: string; username?: string }): boolean {
  return Boolean((report.userId ?? "").trim() || (report.username ?? "").trim());
}

export function isScamReportOwnedByUser(
  report: { userId?: string; username?: string },
  userIdentifier: string
): boolean {
  const currentUser = userIdentifier.trim().toLowerCase();
  if (!currentUser) return false;

  const reportUserId = (report.userId ?? "").trim().toLowerCase();
  const reportUsername = (report.username ?? "").trim().toLowerCase();

  return reportUserId === currentUser || reportUsername === currentUser;
}

export function canPortalUserEditScamReport(
  report: { status?: string; userId?: string; username?: string },
  userIdentifier: string,
  isAdmin = false
): boolean {
  if (isScamReportApproved(report.status ?? "")) return false;
  if (isAdmin) return true;
  if (!userIdentifier.trim()) return false;
  return isScamReportOwnedByUser(report, userIdentifier);
}

export function canPortalUserViewScamReport(
  report: { status?: string; userId?: string; username?: string },
  userIdentifier: string
): boolean {
  if (isScamReportApproved(report.status ?? "")) return true;
  return isScamReportOwnedByUser(report, userIdentifier);
}

export function filterScamReportsForPortalUser<T extends { status?: string; userId?: string; username?: string }>(
  reports: T[],
  userIdentifier: string
): T[] {
  if (!userIdentifier.trim()) {
    return reports.filter((report) => isScamReportApproved(report.status ?? ""));
  }

  return reports.filter((report) => canPortalUserViewScamReport(report, userIdentifier));
}

function parseScamReportRecordId(reportId: string): string | number {
  const trimmed = reportId.trim();
  const asNumber = Number(trimmed);
  return Number.isNaN(asNumber) ? trimmed : asNumber;
}

async function patchScamReportInNocoDB(
  reportId: string,
  fields: Record<string, unknown>
): Promise<void> {
  if (!isScamReportNocodbConfigured()) {
    throw new Error("Scam report NocoDB is not configured");
  }

  const recordId = parseScamReportRecordId(reportId);
  const payload = { Id: recordId, ...fields };
  const headers = getScamReportHeaders();

  let lastError: Error | null = null;

  const patchAttempts: Array<{ path: string; body: string }> = [
    {
      path: `${NOCODB_BASE_URL}/api/v2/tables/${SCAM_REPORT_TABLE_ID}/records`,
      body: JSON.stringify(payload),
    },
  ];

  if (SCAM_REPORT_BASE_ID) {
    patchAttempts.push({
      path: `${NOCODB_BASE_URL}/api/v1/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}`,
      body: JSON.stringify(payload),
    });
  }

  for (const attempt of patchAttempts) {
    try {
      const res = await fetch(attempt.path, {
        method: "PATCH",
        headers,
        body: attempt.body,
        cache: "no-store",
      });
      if (res.ok) return;
      const errBody = await res.json().catch(() => ({}));
      const msg =
        (errBody as { message?: string; msg?: string })?.message ??
        (errBody as { msg?: string })?.msg ??
        res.statusText;
      lastError = new Error(msg || `Update failed: ${res.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  const recordRes = await fetchScamReportNocodb(
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(fields),
    },
    { recordId: String(recordId) }
  );

  if (recordRes.ok) return;

  throw lastError ?? new Error("Failed to update scam report");
}

/** Update scam report Status in NocoDB (Pending or Approve). */
export async function updateScamReportStatusInNocoDB(
  reportId: string,
  status: ScamReportStatus
): Promise<void> {
  await patchScamReportInNocoDB(reportId, { Status: status });
}

/** Update scam report Admin_comment in NocoDB. */
export async function updateScamReportAdminCommentInNocoDB(
  reportId: string,
  adminComment: string
): Promise<void> {
  await patchScamReportInNocoDB(reportId, { Admin_comment: adminComment.trim() });
}

/** Delete a scam report row from NocoDB. */
export async function deleteScamReportFromNocoDB(reportId: string): Promise<void> {
  if (!isScamReportNocodbConfigured()) {
    throw new Error("Scam report NocoDB is not configured");
  }

  const recordId = parseScamReportRecordId(reportId);
  const headers = getScamReportHeaders();
  let lastError: Error | null = null;

  const attempts: Array<{ path: string; body?: string }> = [
    {
      path: `${NOCODB_BASE_URL}/api/v2/tables/${SCAM_REPORT_TABLE_ID}/records/${recordId}`,
    },
    {
      path: `${NOCODB_BASE_URL}/api/v2/tables/${SCAM_REPORT_TABLE_ID}/records`,
      body: JSON.stringify([{ Id: recordId }]),
    },
  ];

  const v1RecordUrl = buildV1Url(String(recordId));
  if (v1RecordUrl) {
    attempts.push({ path: v1RecordUrl });
  }

  if (SCAM_REPORT_BASE_ID) {
    attempts.push({
      path: `${NOCODB_BASE_URL}/api/v2/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}/${recordId}`,
    });
    attempts.push({
      path: `${NOCODB_BASE_URL}/api/v2/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}`,
      body: JSON.stringify([{ Id: recordId }]),
    });
  }

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.path, {
        method: "DELETE",
        headers,
        body: attempt.body,
        cache: "no-store",
      });
      if (res.ok) return;

      const errBody = await res.json().catch(() => ({}));
      const msg =
        (errBody as { message?: string; msg?: string })?.message ??
        (errBody as { msg?: string })?.msg ??
        res.statusText;
      lastError = new Error(msg || `Delete failed: ${res.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw lastError ?? new Error("Failed to delete scam report");
}
