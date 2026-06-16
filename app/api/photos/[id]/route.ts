import { NextRequest, NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID;
const JW_PHOTOS_TABLE_ID = process.env.JW_PHOTOS_TABLE_ID || "mx7ijbo6pn0iv4e";

const headers = () => ({
  "xc-token": NOCODB_API_TOKEN || "",
  "Content-Type": "application/json",
});

/**
 * GET /api/photos/[id] – resolve Photo_ID (e.g. IMG_xxx) to image URL and redirect.
 * Used when templates reference a Photo_ID and the browser requests the image.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const base =
      (request.url && new URL(request.url).origin) ||
      process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${base}/api/photos`, { cache: "no-store" as RequestCache });
    if (!res.ok) return new NextResponse(null, { status: 404 });

    const { photos } = (await res.json()) as { photos?: Array<{ photoId: string; url: string }> };
    const photo = Array.isArray(photos) ? photos.find((p) => p.photoId === id) : undefined;
    if (!photo?.url) return new NextResponse(null, { status: 404 });

    const isPresigned = /X-Amz-Signature=/i.test(photo.url) && /X-Amz-Expires=/i.test(photo.url);
    const target = isPresigned ? photo.url : `${base}/api/photos/proxy?url=${encodeURIComponent(photo.url)}`;
    return NextResponse.redirect(target);
  } catch (error) {
    console.error("GET photo by id error:", error);
    return NextResponse.json({ error: "Failed to resolve photo" }, { status: 500 });
  }
}

/**
 * PATCH /api/photos/[id] – rename photo (update "Photo Name" in NocoDB)
 * Body: { photoName: string }
 * NocoDB v2 path-based PATCH may not be supported; fallback to v1 API.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
      return NextResponse.json(
        { error: "Missing id or NocoDB config" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const photoName = typeof body.photoName === "string" ? body.photoName.trim() : "";
    if (!photoName) {
      return NextResponse.json(
        { error: "photoName is required" },
        { status: 400 }
      );
    }

    const payload = { "Photo Name": photoName };
    const h = headers();

    // Try v2 PATCH first (some NocoDB versions support it)
    let res = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records/${encodeURIComponent(String(id))}`,
      { method: "PATCH", headers: h, body: JSON.stringify(payload) }
    );

    // Fallback to v1 API when v2 returns 404 (NocoDB Cloud often doesn't support v2 record PATCH)
    if (!res.ok && NOCODB_BASE_ID) {
      res = await fetch(
        `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${JW_PHOTOS_TABLE_ID}/${encodeURIComponent(String(id))}`,
        { method: "PATCH", headers: h, body: JSON.stringify(payload) }
      );
    }

    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB PATCH photo error:", err);
      return NextResponse.json(
        { error: "Failed to update photo in NocoDB" },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, photoName });
  } catch (error) {
    console.error("PATCH photo error:", error);
    return NextResponse.json(
      { error: "Failed to update photo" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/photos/[id] – delete photo record from NocoDB
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !NOCODB_BASE_URL || !NOCODB_API_TOKEN) {
      return NextResponse.json(
        { error: "Missing id or NocoDB config" },
        { status: 400 }
      );
    }

    // NocoDB v2: try path-based delete first (single record), then bulk delete with body
    const pathRes = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records/${encodeURIComponent(String(id))}`,
      { method: "DELETE", headers: headers() }
    );

    if (!pathRes.ok) {
      const recordId = Number(id) || id;
      const bulkRes = await fetch(
        `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records`,
        {
          method: "DELETE",
          headers: headers(),
          body: JSON.stringify({ ids: [recordId] }),
        }
      );
      if (!bulkRes.ok) {
        const err = await bulkRes.text();
        console.error("NocoDB DELETE photo error:", err);
        return NextResponse.json(
          { error: "Failed to delete photo from NocoDB" },
          { status: bulkRes.status }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE photo error:", error);
    return NextResponse.json(
      { error: "Failed to delete photo" },
      { status: 500 }
    );
  }
}
