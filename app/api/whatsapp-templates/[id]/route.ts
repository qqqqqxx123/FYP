import { NextRequest, NextResponse } from "next/server";
import {
  fetchWhatsappTemplateNocodb,
  getWhatsappTemplateHeaders,
  isWhatsappTemplateNocodbConfigured,
  NOCODB_SCAM_REPORT_BASE_ID,
  WHATSAPP_TEMPLATE_TABLE_ID,
} from "@/lib/nocodb-whatsapp-templates";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");

function buildRowFromRecord(row: Record<string, unknown>) {
  const getRaw = (key: string) => {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    return "";
  };
  return {
    id: row.Id ?? row.id,
    templateName: row.Template_Name ?? row["Template Name"] ?? "",
    messageBody: row.Message_Body ?? row["Message Body"] ?? "",
    language: row.Language ?? "",
    category: row.Category ?? "",
    region: row.Region ?? "",
    image1: getRaw("Image_1") || getRaw("Image 1"),
    image2: getRaw("Image_2") || getRaw("Image 2"),
    image3: getRaw("Image_3") || getRaw("Image 3"),
    image4: getRaw("Image_4") || getRaw("Image 4"),
    button1: getRaw("Button_1") || getRaw("Button 1"),
    button1Url: getRaw("Button_1_URL") || getRaw("Button_1 URL"),
    button2: getRaw("Button_2") || getRaw("Button 2"),
    button2Url: getRaw("Button_2_URL") || getRaw("Button 2 URL"),
  };
}

/** GET one template by id (raw record for edit – Image_1..4 are Photo_IDs). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isWhatsappTemplateNocodbConfigured()) {
      return NextResponse.json(
        { error: "Missing id or NocoDB config" },
        { status: 400 }
      );
    }

    const res = await fetchWhatsappTemplateNocodb(undefined, { recordId: id });
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: "Template not found" }, { status: 404 });
      const err = await res.text();
      console.error("NocoDB GET template error:", err);
      return NextResponse.json(
        { error: "Failed to load template from NocoDB" },
        { status: res.status }
      );
    }
    const row = (await res.json()) as Record<string, unknown>;
    return NextResponse.json(buildRowFromRecord(row));
  } catch (error) {
    console.error("Template GET error:", error);
    return NextResponse.json(
      { error: "Failed to load template" },
      { status: 500 }
    );
  }
}

/** PATCH update template. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isWhatsappTemplateNocodbConfigured()) {
      return NextResponse.json(
        { error: "Missing id or NocoDB config" },
        { status: 400 }
      );
    }
    const body = await request.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const payload: Record<string, unknown> = {
      Update_At: new Date().toISOString(),
    };
    const set = (key: string, nocoKey: string) => {
      const v = (body as Record<string, unknown>)[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") payload[nocoKey] = String(v).trim();
    };
    set("templateName", "Template_Name");
    set("messageBody", "Message_Body");
    set("language", "Language");
    set("category", "Category");
    set("region", "Region");
    set("image1", "Image_1");
    set("image2", "Image_2");
    set("image3", "Image_3");
    set("image4", "Image_4");
    set("button1", "Button_1");
    set("button1Url", "Button_1_URL");
    set("button2", "Button_2");
    set("button2Url", "Button_2_URL");
    delete (payload as Record<string, unknown>).Id;
    delete (payload as Record<string, unknown>).id;

    const res = await fetchWhatsappTemplateNocodb(
      {
        method: "PATCH",
        headers: getWhatsappTemplateHeaders(),
        body: JSON.stringify(payload),
      },
      { recordId: id }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB PATCH template error:", err);
      return NextResponse.json(
        { error: "Failed to update template in NocoDB" },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Template PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update template" },
      { status: 500 }
    );
  }
}

/** DELETE template. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isWhatsappTemplateNocodbConfigured()) {
      return NextResponse.json(
        { error: "Missing id or NocoDB config" },
        { status: 400 }
      );
    }

    let res = await fetchWhatsappTemplateNocodb({ method: "DELETE" }, { recordId: id });

    if (!res.ok) {
      const recordId = Number(id) || id;
      const bulkRes = await fetch(
        `${NOCODB_BASE_URL}/api/v2/tables/${WHATSAPP_TEMPLATE_TABLE_ID}/records`,
        {
          method: "DELETE",
          headers: getWhatsappTemplateHeaders(),
          body: JSON.stringify({ ids: [recordId] }),
          cache: "no-store",
        }
      );
      if (!bulkRes.ok && NOCODB_SCAM_REPORT_BASE_ID) {
        const v1Res = await fetch(
          `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_SCAM_REPORT_BASE_ID}/${WHATSAPP_TEMPLATE_TABLE_ID}/${encodeURIComponent(String(id))}`,
          { method: "DELETE", headers: getWhatsappTemplateHeaders(), cache: "no-store" }
        );
        if (!v1Res.ok) {
          const err = await v1Res.text();
          console.error("NocoDB DELETE template error:", err);
          return NextResponse.json(
            { error: "Failed to delete template from NocoDB" },
            { status: v1Res.status }
          );
        }
      } else if (!bulkRes.ok) {
        const err = await bulkRes.text();
        console.error("NocoDB DELETE template error:", err);
        return NextResponse.json(
          { error: "Failed to delete template from NocoDB" },
          { status: bulkRes.status }
        );
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Template DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
