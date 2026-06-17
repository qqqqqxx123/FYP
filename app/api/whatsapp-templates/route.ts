import { NextResponse } from "next/server";
import {
  fetchWhatsappTemplateNocodb,
  getWhatsappTemplateHeaders,
  isWhatsappTemplateNocodbConfigured,
} from "@/lib/nocodb-whatsapp-templates";

/** True if value looks like a stored Photo_ID (e.g. IMG_...). */
function isPhotoId(value: string): boolean {
  return /^IMG_/.test(value?.trim() ?? "");
}

/** Get raw image value: string (Photo_ID or URL) or first attachment url. */
function getRawImage(r: Record<string, unknown>, key: string): string | undefined {
  const v = r[key];
  if (!v) return undefined;
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v[0] && typeof v[0] === "object" && v[0] !== null) {
    const first = v[0] as { url?: string; path?: string };
    return (first.url ?? first.path ?? "") || undefined;
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    if (!isWhatsappTemplateNocodbConfigured()) {
      return NextResponse.json(
        { error: "NocoDB configuration missing" },
        { status: 500 }
      );
    }

    const res = await fetchWhatsappTemplateNocodb(undefined, { query: "limit=100" });
    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB templates list error:", err);
      throw new Error("Failed to fetch templates");
    }
    const data = (await res.json()) as
      | { list?: Record<string, unknown>[]; rows?: Record<string, unknown>[] }
      | Record<string, unknown>[];
    const list = Array.isArray(data)
      ? data
      : (data?.list ?? data?.rows ?? []);

    let photoUrlById = new Map<string, string>();
    try {
      const base =
        (request?.url && new URL(request.url).origin) ||
        process.env.NEXTAUTH_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const photosRes = await fetch(`${base}/api/photos`, {
        cache: "no-store" as RequestCache,
      });
      if (photosRes.ok) {
        const { photos } = (await photosRes.json()) as {
          photos?: Array<{ photoId: string; url: string }>;
        };
        if (Array.isArray(photos)) {
          for (const photo of photos) {
            if (photo.photoId && photo.url) {
              photoUrlById.set(photo.photoId, photo.url);
            }
          }
        }
      }
    } catch (e) {
      console.warn("Resolving template image IDs to URLs failed:", e);
    }

    const resolveImage = (raw: string | undefined): string | undefined => {
      if (!raw) return undefined;
      if (isPhotoId(raw)) return photoUrlById.get(raw) ?? raw;
      return raw;
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

    const templates = list.map((row) => {
      const r = row as Record<string, unknown>;
      const raw1 = getRawImage(r, "Image_1") ?? getRawImage(r, "Image 1");
      const raw2 = getRawImage(r, "Image_2") ?? getRawImage(r, "Image 2");
      const raw3 = getRawImage(r, "Image_3") ?? getRawImage(r, "Image 3");
      const raw4 = getRawImage(r, "Image_4") ?? getRawImage(r, "Image 4");
      return {
        id: getRecordId(r),
        templateName: r.Template_Name ?? r["Template Name"] ?? r.templateName ?? "",
        messageBody: r.Message_Body ?? r["Message Body"] ?? r.messageBody ?? "",
        language: r.Language ?? r.language ?? "",
        category: r.Category ?? r["Category"] ?? r.category ?? "",
        region: r.Region ?? r["Region"] ?? r.region ?? "",
        image1: resolveImage(raw1),
        image2: resolveImage(raw2),
        image3: resolveImage(raw3),
        image4: resolveImage(raw4),
      };
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Templates list error:", error);
    return NextResponse.json(
      { error: "Failed to load templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isWhatsappTemplateNocodbConfigured()) {
      return NextResponse.json(
        { error: "NocoDB configuration missing" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const templateName = (body.templateName ?? body.Template_Name ?? "").toString().trim();
    const language = (body.language ?? body.Language ?? "").toString().trim();
    const category = (body.category ?? body.Category ?? body.Catrgory ?? "").toString().trim();
    const region = (body.region ?? body.Region ?? "").toString().trim();
    const messageBody = (body.messageBody ?? body.Message_Body ?? "").toString().trim();
    const image1 = (body.image1 ?? body.Image_1 ?? "").toString().trim();
    const image2 = (body.image2 ?? body.Image_2 ?? "").toString().trim();
    const image3 = (body.image3 ?? body.Image_3 ?? "").toString().trim();
    const image4 = (body.image4 ?? body.Image_4 ?? "").toString().trim();
    const button1 = (body.button1 ?? body.Button_1 ?? "").toString().trim();
    const button1Url = (body.button1Url ?? body.Button_1_URL ?? "").toString().trim();
    const button2 = (body.button2 ?? body.Button_2 ?? "").toString().trim();
    const button2Url = (body.button2Url ?? body.Button_2_URL ?? "").toString().trim();

    if (!templateName) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const templateId = `TPL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const payload: Record<string, unknown> = {
      Template_ID: templateId,
      Template_Name: templateName,
      Message_Body: messageBody || undefined,
      Create_At: now,
      Update_At: now,
      Image_1: image1 || undefined,
      Image_2: image2 || undefined,
      Image_3: image3 || undefined,
      Image_4: image4 || undefined,
      Button_1: button1 || undefined,
      Button_1_URL: button1Url || undefined,
      Button_2: button2 || undefined,
      Button_2_URL: button2Url || undefined,
    };
    if (language) payload.Language = language;
    if (category) payload.Category = category;
    if (region) payload.Region = region;

    const res = await fetchWhatsappTemplateNocodb({
      method: "POST",
      headers: getWhatsappTemplateHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("NocoDB template create error:", errText);
      throw new Error("Failed to create template in NocoDB");
    }

    const result = await res.json();
    return NextResponse.json({
      success: true,
      templateId,
      result,
    });
  } catch (error) {
    console.error("Template create error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create template",
      },
      { status: 500 }
    );
  }
}
