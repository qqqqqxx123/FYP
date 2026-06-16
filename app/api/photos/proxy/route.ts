import { NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;

/**
 * Extract path from NocoDB S3 URL for proxy.
 * e.g. https://bucket.s3.region.amazonaws.com/nc/uploads/2026/01/30/xxx.png -> /nc/uploads/2026/01/30/xxx.png
 * Also accepts paths like /uploads/... used by some NocoDB Cloud buckets.
 */
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
 * Proxy image from NocoDB. Handles:
 * 1. Direct NocoDB URLs (app.nocodb.com) - fetch with xc-token
 * 2. Private S3 URLs (NocoDB Cloud stores these) - try NocoDB download paths with xc-token
 * GET /api/photos/proxy?url=<encoded-full-url>
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const encodedUrl = searchParams.get("url");
    if (!encodedUrl || !NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
      return NextResponse.json({ error: "Missing url or config" }, { status: 400 });
    }

    let url: string;
    try {
      url = decodeURIComponent(encodedUrl);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const headers: Record<string, string> = {
      "xc-token": NOCODB_API_TOKEN,
      ...(NOCODB_API_TOKEN && { Authorization: `Bearer ${NOCODB_API_TOKEN}` }),
    };
    let urlsToTry: string[] = [];

    if (isNocoDbS3Url(url)) {
      // NocoDB Cloud stores direct S3 URLs (Access Denied). Try NocoDB proxy paths with token.
      const path = extractPathFromS3Url(url);
      if (path) {
        const pathNoLeading = path.replace(/^\//, "");
        urlsToTry = [
          `${NOCODB_BASE_URL}${path}`,
          `${NOCODB_BASE_URL}/dl${path}`,
          `${NOCODB_BASE_URL}/api/v2/storage/download?path=${encodeURIComponent(pathNoLeading)}`,
          `${NOCODB_BASE_URL}/api/v2/storage/download?path=${encodeURIComponent(path)}`,
          `${NOCODB_BASE_URL}/api/v2/storage/download?url=${encodeURIComponent(url)}`,
          `${NOCODB_BASE_URL}/api/v1/db/storage/download?path=${encodeURIComponent(pathNoLeading)}`,
        ];
      }
    } else if (url.startsWith("/")) {
      urlsToTry = [`${NOCODB_BASE_URL}${url}`];
    } else if (url.startsWith(NOCODB_BASE_URL)) {
      urlsToTry = [url];
    } else {
      return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
    }

    let lastStatus = 404;
    for (const tryUrl of urlsToTry) {
      const res = await fetch(tryUrl, { headers });
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buffer = await res.arrayBuffer();
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=300",
          },
        });
      }
      lastStatus = res.status;
    }

    return new NextResponse(null, { status: lastStatus });
  } catch (error) {
    console.error("Photo proxy error:", error);
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}
