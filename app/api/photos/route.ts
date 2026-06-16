import { NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const JW_PHOTOS_TABLE_ID = process.env.JW_PHOTOS_TABLE_ID || "mx7ijbo6pn0iv4e";

const PHOTOS_CACHE_TTL_MS = Number(process.env.NOCODB_PHOTOS_CACHE_TTL_MS) || 60_000; // 1 min
const PHOTOS_CACHE_EMPTY_ON_429_MS = Number(process.env.NOCODB_PHOTOS_CACHE_EMPTY_ON_429_MS) || 15_000; // 15s when 429
const NOCODB_RETRY_DELAYS_MS = [1000, 2000, 4000]; // backoff on 429

export interface PhotoOption {
  id: number;
  /** Raw record id from NocoDB (use for PATCH/DELETE) */
  recordId: string | number;
  photoId: string;
  photoName: string;
  url: string;
}

/** Short-lived cache to reduce NocoDB request volume and avoid 429. */
let photosCache: { photos: PhotoOption[]; expiresAt: number } | null = null;

/** Check if URL is already a presigned S3 URL (safe to use in <img src>). */
function isPresignedUrl(url: string): boolean {
  return /X-Amz-Signature=/i.test(url) && /X-Amz-Expires=/i.test(url);
}

/** Extract path from NocoDB S3 URL for download API. */
function extractPathFromS3Url(s3Url: string): string | null {
  try {
    const u = new URL(s3Url);
    const path = u.pathname;
    if (path.startsWith("/nc/")) return path;
    if (path.includes("uploads")) return path.startsWith("/") ? path : `/${path}`;
    return null;
  } catch {
    return null;
  }
}

function isNocoDbS3Url(url: string): boolean {
  return (
    url.includes("amazonaws.com") ||
    (url.includes("s3.") && url.includes("nocohub")) ||
    url.includes("s3.us-east-2.amazonaws.com")
  );
}

/**
 * Try to get a presigned URL from NocoDB for a raw S3 attachment URL.
 * NocoDB Cloud may respond with 302 redirect to presigned S3 URL; we return that for <img src>.
 */
async function getPresignedUrlIfPossible(rawUrl: string): Promise<string> {
  if (!NOCODB_BASE_URL || !NOCODB_API_TOKEN || isPresignedUrl(rawUrl)) {
    return rawUrl;
  }
  if (!isNocoDbS3Url(rawUrl)) {
    return rawUrl;
  }
  const path = extractPathFromS3Url(rawUrl);
  if (!path) return rawUrl;

  const headers: Record<string, string> = {
    "xc-token": NOCODB_API_TOKEN,
    ...(NOCODB_API_TOKEN && { Authorization: `Bearer ${NOCODB_API_TOKEN}` }),
  };
  const pathNoLeading = path.replace(/^\//, "");
  const candidates = [
    `${NOCODB_BASE_URL}/api/v2/storage/download?path=${encodeURIComponent(pathNoLeading)}`,
    `${NOCODB_BASE_URL}/api/v2/storage/download?path=${encodeURIComponent(path)}`,
    `${NOCODB_BASE_URL}/api/v2/storage/download?url=${encodeURIComponent(rawUrl)}`,
  ];

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers,
        redirect: "manual",
      });
      const location = res.headers.get("location");
      if ((res.status === 301 || res.status === 302) && location && isPresignedUrl(location)) {
        return location;
      }
    } catch {
      // ignore
    }
  }
  return rawUrl;
}

export async function GET() {
  try {
    if (!NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
      return NextResponse.json(
        { error: "NocoDB configuration missing" },
        { status: 500 }
      );
    }

    const now = Date.now();
    if (photosCache && photosCache.expiresAt > now) {
      return NextResponse.json({ photos: photosCache.photos });
    }

    const headers = {
      "xc-token": NOCODB_API_TOKEN,
      "Content-Type": "application/json",
    };

    const fetchOpts = { headers, cache: "no-store" as RequestCache };
    const v2Url = `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records?limit=100&pageSize=100`;
    const baseId = process.env.NOCODB_BASE_ID;
    const v1Url = baseId
      ? `${NOCODB_BASE_URL}/api/v1/db/data/noco/${baseId}/${JW_PHOTOS_TABLE_ID}?limit=100`
      : null;

    let res: Response | null = null;
    let lastStatus = 0;
    let lastErrText = "";

    for (let attempt = 0; attempt <= NOCODB_RETRY_DELAYS_MS.length; attempt++) {
      res = await fetch(v2Url, fetchOpts);
      if (!res.ok && v1Url) {
        res = await fetch(v1Url, fetchOpts);
      }
      lastStatus = res.status;
      if (res.ok) break;
      lastErrText = await res.text();
      if (res.status === 429 && attempt < NOCODB_RETRY_DELAYS_MS.length) {
        const delay = NOCODB_RETRY_DELAYS_MS[attempt];
        console.warn("NocoDB photos 429, retrying in", delay, "ms (attempt", attempt + 1, ")");
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      break;
    }

    if (!res || !res.ok) {
      console.error("NocoDB photos fetch failed:", lastStatus, lastErrText);
      photosCache = {
        photos: [],
        expiresAt: now + PHOTOS_CACHE_EMPTY_ON_429_MS,
      };
      return NextResponse.json({ photos: [] });
    }

    const data = (await res.json()) as {
      list?: Array<Record<string, unknown>>;
      data?: Array<Record<string, unknown>>;
      records?: Array<Record<string, unknown>>;
      pageInfo?: { totalRows?: number; pageSize?: number; page?: number };
    };

    let list = data?.list ?? data?.data ?? data?.records ?? [];
    const pageInfo = data?.pageInfo;
    // If NocoDB returned pagination and we got fewer than totalRows, fetch remaining pages
    if (pageInfo && pageInfo.totalRows != null && pageInfo.pageSize != null && list.length < pageInfo.totalRows) {
      const pageSize = pageInfo.pageSize;
      for (let offset = pageSize; offset < pageInfo.totalRows; offset += pageSize) {
        await new Promise((r) => setTimeout(r, 200)); // small delay to avoid NocoDB 429 on pagination
        const nextRes = await fetch(
          `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records?limit=${pageSize}&offset=${offset}`,
          fetchOpts
        );
        if (!nextRes.ok) break;
        const nextData = (await nextRes.json()) as { list?: Array<Record<string, unknown>> };
        const nextList = nextData?.list ?? [];
        if (nextList.length === 0) break;
        list = [...list, ...nextList];
      }
    }
    type RowLike = { url?: string; path?: string; filePath?: string; signedUrl?: string };
    const photosWithRawUrls: PhotoOption[] = list
      .map((row, index) => {
        const photo = row.Photo ?? row.photo ?? row["Photo"];
        let url = "";
        const first = Array.isArray(photo) ? photo[0] : photo && typeof photo === "object" ? (photo as RowLike) : null;
        if (first) {
          // Prefer presigned/signed URL if NocoDB returns it (e.g. signedUrl or url with X-Amz-Signature)
          const signed = (first as RowLike).signedUrl ?? "";
          const raw = (first.url ?? first.path ?? first.filePath ?? "").toString();
          if (signed && isPresignedUrl(signed)) {
            url = signed;
          } else if (raw) {
            url = raw;
            if (url.startsWith("/") && !url.startsWith("//") && !isPresignedUrl(url)) {
              url = `${NOCODB_BASE_URL}${url}`;
            }
          }
        }
        const photoName = String(
          row["Photo Name"] ?? row.Photo_Name ?? row.photoName ?? row.photo_name ?? ""
        ).trim();
        const rawPhotoId = row.Photo_ID ?? row["Photo_ID"] ?? row.photo_id ?? row["photo_id"];
        const photoId = rawPhotoId != null ? String(rawPhotoId) : "";
        const rawRecordId = row.Id ?? row.id;
        const rowId = Number(rawRecordId ?? 0);
        return {
          id: rowId || index + 1,
          recordId: rawRecordId != null ? rawRecordId : index + 1,
          photoId: photoId || String(rawRecordId ?? index + 1),
          photoName,
          url,
        };
      })
      .filter((p) => p.id != null || p.photoName || p.url || p.photoId);

    // Resolve raw NocoDB S3 URLs to presigned URLs so <img src> works without proxy/auth
    const photos: PhotoOption[] = await Promise.all(
      photosWithRawUrls.map(async (p) => {
        if (!p.url || isPresignedUrl(p.url)) return p;
        const presigned = await getPresignedUrlIfPossible(p.url);
        return { ...p, url: presigned };
      })
    );

    photosCache = { photos, expiresAt: Date.now() + PHOTOS_CACHE_TTL_MS };
    return NextResponse.json({ photos });
  } catch (error) {
    console.error("Photos list error:", error);
    return NextResponse.json(
      { error: "Failed to load photos" },
      { status: 500 }
    );
  }
}
