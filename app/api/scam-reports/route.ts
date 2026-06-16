import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  buildScamReportRowPayload,
  canPortalUserEditScamReport,
  fetchScamReportNocodb,
  filterScamReportsForPortalUser,
  getScamReportHeaders,
  isScamReportNocodbConfigured,
  isScamReportOwnedByUser,
  mapScamReportRecord,
  SCAM_REPORT_BASE_ID,
  SCAM_REPORT_TABLE_ID,
} from "@/lib/nocodb-scam-report";
import {
  getSessionNocoDbUserId,
  getSessionUserIdentifier,
  isAdminSession,
} from "@/lib/session";

async function readSessionUser(): Promise<{ userId?: string; username?: string }> {
  const session = (await cookies()).get("crm-session")?.value ?? "";
  const identifier = getSessionUserIdentifier(session);
  if (!identifier) return {};

  return {
    userId: identifier,
    username: identifier.includes("@") ? identifier : undefined,
  };
}

export async function GET() {
  try {
    if (!isScamReportNocodbConfigured()) {
      return NextResponse.json(
        {
          error:
            "Scam report NocoDB is not configured. Set NOCODB_SCAM_REPORT_TABLE_ID=mbizf5g0fbckz8v and NOCODB_SCAM_REPORT_BASE_ID=piw9hpabl564xhf.",
        },
        { status: 500 }
      );
    }

    const res = await fetchScamReportNocodb(undefined, { query: "limit=100" });
    if (!res.ok) {
      const err = await res.text();
      console.error("NocoDB scam reports list error:", {
        status: res.status,
        baseId: SCAM_REPORT_BASE_ID,
        tableId: SCAM_REPORT_TABLE_ID,
        err,
      });
      return NextResponse.json(
        { error: "Failed to load scam reports from NocoDB." },
        { status: res.status }
      );
    }

    const data = (await res.json()) as
      | { list?: Record<string, unknown>[]; rows?: Record<string, unknown>[] }
      | Record<string, unknown>[];
    const list = Array.isArray(data) ? data : (data?.list ?? data?.rows ?? []);

    const session = (await cookies()).get("crm-session")?.value;
    const userIdentifier = getSessionUserIdentifier(session);
    const sessionUserId = getSessionNocoDbUserId(session);
    const isAdmin = isAdminSession(session);
    const templates = filterScamReportsForPortalUser(
      list.map((row) => mapScamReportRecord(row as Record<string, unknown>)),
      userIdentifier
    ).map((report) => {
      const isOwned =
        isScamReportOwnedByUser(report, userIdentifier) ||
        (sessionUserId ? isScamReportOwnedByUser(report, sessionUserId) : false);

      return {
        ...report,
        status: report.status || report.category || "",
        canEdit: canPortalUserEditScamReport(report, userIdentifier, isAdmin),
        isOwned,
      };
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Scam reports list error:", error);
    return NextResponse.json({ error: "Failed to load scam reports" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!isScamReportNocodbConfigured()) {
      return NextResponse.json({ error: "Scam report NocoDB is not configured" }, { status: 500 });
    }

    const body = await request.json();
    const scamType = (
      body.scamType ??
      body.templateName ??
      body.language ??
      body.Language ??
      ""
    )
      .toString()
      .trim();
    const reportDate = (body.reportDate ?? "").toString().trim();
    const description = (body.description ?? body.messageBody ?? "").toString().trim();
    const platform = (body.platform ?? body.region ?? body.Platform ?? "").toString().trim();
    const contactDetail = (body.contactDetail ?? body.Contact_detail ?? "").toString().trim();
    const scamMessageText = (body.scamMessageText ?? body.Scam_Message_Text ?? "").toString().trim();
    const sessionUser = await readSessionUser();
    const userId = (body.userId ?? sessionUser.userId)?.toString().trim();
    const username = (
      body.username ??
      sessionUser.username ??
      (userId?.includes("@") ? userId : undefined)
    )
      ?.toString()
      .trim();

    if (!scamType) {
      return NextResponse.json({ error: "Scam type is required" }, { status: 400 });
    }

    const payload = buildScamReportRowPayload({
      scamType,
      reportDate,
      description,
      contactDetail,
      scamMessageText,
      platform,
      userId,
      username,
      image1: body.image1,
      image2: body.image2,
      image3: body.image3,
      image4: body.image4,
    });

    const res = await fetchScamReportNocodb({
      method: "POST",
      headers: getScamReportHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("NocoDB scam report create error:", {
        status: res.status,
        baseId: SCAM_REPORT_BASE_ID,
        tableId: SCAM_REPORT_TABLE_ID,
        errText,
      });
      return NextResponse.json({ error: "Failed to save scam report to NocoDB." }, { status: res.status });
    }

    const result = await res.json();
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Scam report create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create scam report" },
      { status: 500 }
    );
  }
}
