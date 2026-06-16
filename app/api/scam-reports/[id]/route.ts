import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  canPortalUserEditScamReport,
  canPortalUserViewScamReport,
  fetchScamReportNocodb,
  getScamReportHeaders,
  isScamReportApproved,
  isScamReportNocodbConfigured,
  mapScamReportRecord,
  normalizeReportDate,
  SCAM_REPORT_BASE_ID,
  SCAM_REPORT_TABLE_ID,
} from "@/lib/nocodb-scam-report";
import { getSessionUserIdentifier, isAdminSession } from "@/lib/session";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isScamReportNocodbConfigured()) {
      return NextResponse.json({ error: "Missing id or NocoDB config" }, { status: 400 });
    }

    const res = await fetchScamReportNocodb(undefined, { recordId: id });
    if (!res.ok) {
      if (res.status === 404) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      return NextResponse.json({ error: "Failed to load scam report" }, { status: res.status });
    }

    const row = (await res.json()) as Record<string, unknown>;
    const report = mapScamReportRecord(row);
    const session = (await cookies()).get("crm-session")?.value;
    const userIdentifier = getSessionUserIdentifier(session);
    const isAdmin = isAdminSession(session);
    if (!canPortalUserViewScamReport(report, userIdentifier)) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...report,
      canEdit: canPortalUserEditScamReport(report, userIdentifier, isAdmin),
    });
  } catch (error) {
    console.error("Scam report GET error:", error);
    return NextResponse.json({ error: "Failed to load scam report" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isScamReportNocodbConfigured()) {
      return NextResponse.json({ error: "Missing id or NocoDB config" }, { status: 400 });
    }

    const existingRes = await fetchScamReportNocodb(undefined, { recordId: id });
    if (!existingRes.ok) {
      if (existingRes.status === 404) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to load scam report" }, { status: existingRes.status });
    }

    const existingReport = mapScamReportRecord((await existingRes.json()) as Record<string, unknown>);
    const session = (await cookies()).get("crm-session")?.value;
    const userIdentifier = getSessionUserIdentifier(session);
    const isAdmin = isAdminSession(session);
    if (isScamReportApproved(existingReport.status ?? "")) {
      return NextResponse.json({ error: "Approved reports cannot be edited." }, { status: 403 });
    }
    if (!canPortalUserEditScamReport(existingReport, userIdentifier, isAdmin)) {
      return NextResponse.json(
        { error: "You can only edit scam reports that you submitted." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const record = body as Record<string, unknown>;
    const scamType = (record.scamType ?? record.templateName ?? record.language ?? "").toString().trim();
    const reportDate = normalizeReportDate((record.reportDate ?? "").toString());
    const description = (record.description ?? record.messageBody ?? "").toString().trim();
    const platform = (record.platform ?? record.region ?? "").toString().trim();
    const contactDetail = (record.contactDetail ?? record.Contact_detail ?? "").toString().trim();
    const scamMessageText = (record.scamMessageText ?? record.Scam_Message_Text ?? "").toString().trim();

    const payload: Record<string, unknown> = {};
    if (scamType) payload.Scam_Type = scamType;
    if (record.description !== undefined || record.messageBody !== undefined) {
      payload.Description = description || null;
    }
    if (record.reportDate !== undefined) {
      payload.Date_of_Incident = reportDate || null;
    }
    if (platform) payload.Platform = platform;
    if (record.contactDetail !== undefined || record.Contact_detail !== undefined) {
      payload.Contact_detail = contactDetail || null;
    }
    if (record.scamMessageText !== undefined || record.Scam_Message_Text !== undefined) {
      payload.Scam_Message_Text = scamMessageText || null;
    }
    if (record.image1 !== undefined) payload.Image_1 = record.image1;
    if (record.image2 !== undefined) payload.Image_2 = record.image2;
    if (record.image3 !== undefined) payload.Image_3 = record.image3;
    if (record.image4 !== undefined) payload.Image_4 = record.image4;

    const res = await fetchScamReportNocodb(
      {
        method: "PATCH",
        headers: getScamReportHeaders(),
        body: JSON.stringify(payload),
      },
      { recordId: id }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB scam report PATCH error:", err);
      return NextResponse.json({ error: "Failed to update scam report" }, { status: res.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Scam report PATCH error:", error);
    return NextResponse.json({ error: "Failed to update scam report" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || !isScamReportNocodbConfigured()) {
      return NextResponse.json({ error: "Missing id or NocoDB config" }, { status: 400 });
    }

    const existingRes = await fetchScamReportNocodb(undefined, { recordId: id });
    if (!existingRes.ok) {
      if (existingRes.status === 404) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to load scam report" }, { status: existingRes.status });
    }

    const existingReport = mapScamReportRecord((await existingRes.json()) as Record<string, unknown>);
    const session = (await cookies()).get("crm-session")?.value;
    const userIdentifier = getSessionUserIdentifier(session);
    const isAdmin = isAdminSession(session);
    if (isScamReportApproved(existingReport.status ?? "")) {
      return NextResponse.json({ error: "Approved reports cannot be deleted." }, { status: 403 });
    }
    if (!canPortalUserEditScamReport(existingReport, userIdentifier, isAdmin)) {
      return NextResponse.json(
        { error: "You can only delete scam reports that you submitted." },
        { status: 403 }
      );
    }

    let res = await fetchScamReportNocodb({ method: "DELETE" }, { recordId: id });

    if (!res.ok) {
      const recordId = Number(id) || id;
      const bulkRes = await fetch(
        `${NOCODB_BASE_URL}/api/v2/tables/${SCAM_REPORT_TABLE_ID}/records`,
        {
          method: "DELETE",
          headers: getScamReportHeaders(),
          body: JSON.stringify({ ids: [recordId] }),
          cache: "no-store",
        }
      );
      if (!bulkRes.ok && SCAM_REPORT_BASE_ID) {
        const v1Res = await fetch(
          `${NOCODB_BASE_URL}/api/v1/db/data/noco/${SCAM_REPORT_BASE_ID}/${SCAM_REPORT_TABLE_ID}/${encodeURIComponent(String(id))}`,
          { method: "DELETE", headers: getScamReportHeaders(), cache: "no-store" }
        );
        if (!v1Res.ok) {
          return NextResponse.json({ error: "Failed to delete scam report" }, { status: v1Res.status });
        }
      } else if (!bulkRes.ok) {
        return NextResponse.json({ error: "Failed to delete scam report" }, { status: bulkRes.status });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Scam report DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete scam report" }, { status: 500 });
  }
}
