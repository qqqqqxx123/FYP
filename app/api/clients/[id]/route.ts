import { NextRequest, NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID;
const CLIENTS_TABLE_ID = process.env.NOCODB_CLIENTS_TABLE_ID ?? "Clients";

const headers = () => ({
  "xc-token": NOCODB_API_TOKEN || "",
  "Content-Type": "application/json",
});

/** Map request body keys to NocoDB column names (table uses Purchase_Date, Purchase_Amount, etc.) */
function toNocoDBPatchBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = {
    Name: "Name",
    Whatsapp_number: "Whatsapp_number",
    Gender: "Gender",
    DOB: "DOB",
    Tags: "Tags",
    Purchase_Date: "Purchase_Date",
    "Purchase Date": "Purchase_Date",
    "Last purchase date": "Purchase_Date",
    Purchase_Amount: "Purchase_Amount",
    "Purchase Amount": "Purchase_Amount",
    "Total purchase amount": "Purchase_Amount",
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || key === "Id" || key === "id") continue;
    const col = map[key] ?? key;
    out[col] = value;
  }
  return out;
}

/**
 * PATCH /api/clients/[id] – update client record in NocoDB
 * Body: partial ClientRecord (Name, Whatsapp_number, Gender, etc.)
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
    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    const h = headers();
    const payload = toNocoDBPatchBody(body as Record<string, unknown>);

    let res = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${CLIENTS_TABLE_ID}/records/${encodeURIComponent(String(id))}`,
      { method: "PATCH", headers: h, body: JSON.stringify(payload) }
    );

    if (!res.ok && NOCODB_BASE_ID) {
      res = await fetch(
        `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${CLIENTS_TABLE_ID}/${encodeURIComponent(String(id))}`,
        { method: "PATCH", headers: h, body: JSON.stringify(payload) }
      );
    }

    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB PATCH client error:", err);
      return NextResponse.json(
        { error: "Failed to update client in NocoDB" },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH client error:", error);
    return NextResponse.json(
      { error: "Failed to update client" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/clients/[id] – delete client record from NocoDB
 * Tries v2 path delete, then v1 path delete (if base ID set), then v2 bulk delete.
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

    const h = headers();
    const idStr = String(id);
    const idNum = Number(id);
    const recordId = Number.isNaN(idNum) ? id : idNum;

    // 1) v2 path-based delete
    let res = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${CLIENTS_TABLE_ID}/records/${encodeURIComponent(idStr)}`,
      { method: "DELETE", headers: h }
    );

    // 2) v1 path-based delete (many NocoDB setups use this); try numeric then string id
    if (!res.ok && NOCODB_BASE_ID) {
      res = await fetch(
        `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${CLIENTS_TABLE_ID}/${recordId}`,
        { method: "DELETE", headers: h }
      );
      if (!res.ok) {
        res = await fetch(
          `${NOCODB_BASE_URL}/api/v1/db/data/noco/${NOCODB_BASE_ID}/${CLIENTS_TABLE_ID}/${encodeURIComponent(idStr)}`,
          { method: "DELETE", headers: h }
        );
      }
    }

    // 3) v2 bulk delete with ids array
    if (!res.ok) {
      const bulkRes = await fetch(
        `${NOCODB_BASE_URL}/api/v2/tables/${CLIENTS_TABLE_ID}/records`,
        {
          method: "DELETE",
          headers: h,
          body: JSON.stringify({ ids: [recordId] }),
        }
      );
      if (bulkRes.ok) {
        return NextResponse.json({ success: true });
      }
      const err = await bulkRes.text();
      console.error("NocoDB DELETE client error:", err);
      return NextResponse.json(
        { error: "Failed to delete client from NocoDB" },
        { status: bulkRes.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE client error:", error);
    return NextResponse.json(
      { error: "Failed to delete client" },
      { status: 500 }
    );
  }
}
