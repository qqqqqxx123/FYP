import { NextResponse } from "next/server";
import {
  getScamReportForMessage,
  isWhatsAppInboxNocoDBConfigured,
} from "@/lib/whatsapp-inbox-nocodb";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";

const CACHE_NO_STORE = "no-store, no-cache, must-revalidate";

/**
 * GET /api/whatsapp/conversations/:id/messages/:messageId/scam-report
 * Returns the detailed scam alert report linked to a flagged message.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const headers = new Headers();
  headers.set("Cache-Control", CACHE_NO_STORE);

  try {
    const { id, messageId } = await params;
    if (!id || !messageId) {
      return NextResponse.json(
        { error: "Conversation id and message id are required" },
        { status: 400, headers }
      );
    }

    if (!isWhatsAppInboxNocoDBConfigured()) {
      return NextResponse.json(
        { error: "WhatsApp inbox NocoDB is not configured" },
        { status: 503, headers }
      );
    }

    const { searchParams } = new URL(request.url);
    const { sessionId } = await requireWhatsAppUser({
      sessionId: searchParams.get("sessionId"),
    });
    const { report } = await getScamReportForMessage(id, messageId, { sessionId });
    return NextResponse.json({ report }, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load scam report";
    const status =
      message === "UNAUTHORIZED"
        ? 401
        : message === "MESSAGE_NOT_FOUND" || message === "SCAM_REPORT_NOT_FOUND"
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status, headers });
  }
}
