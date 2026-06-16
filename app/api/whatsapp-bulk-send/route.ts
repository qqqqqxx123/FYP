import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_URL =
  process.env.WHATSAPP_OUTBOUND_WEBHOOK_URL ||
  "https://advsysuperuser001.app.n8n.cloud/webhook/whatsapp-outbound";

export interface BulkSendPayload {
  recipients: Array<{ phone: string; name?: string }>;
  templateId?: string;
  templateName?: string;
  messageBody?: string;
  image1?: string;
  image2?: string;
  image3?: string;
  image4?: string;
}

/**
 * POST /api/whatsapp-bulk-send
 * Forwards the bulk send request to the n8n webhook for WhatsApp outbound.
 * Body: { recipients: [{ phone, name? }], templateId?, templateName?, messageBody? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const recipients = body.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: "recipients array is required and must not be empty" },
        { status: 400 }
      );
    }

    const payload: BulkSendPayload = {
      recipients: recipients.map((r: { phone?: string; name?: string }) => ({
        phone: String(r.phone ?? "").trim(),
        name: r.name ? String(r.name).trim() : undefined,
      })),
    };
    if (body.templateId != null) payload.templateId = String(body.templateId).trim();
    if (body.templateName != null) payload.templateName = String(body.templateName).trim();
    if (body.messageBody != null) payload.messageBody = String(body.messageBody).trim();
    if (body.image1 != null && String(body.image1).trim()) payload.image1 = String(body.image1).trim();
    if (body.image2 != null && String(body.image2).trim()) payload.image2 = String(body.image2).trim();
    if (body.image3 != null && String(body.image3).trim()) payload.image3 = String(body.image3).trim();
    if (body.image4 != null && String(body.image4).trim()) payload.image4 = String(body.image4).trim();

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("WhatsApp bulk send webhook error:", res.status, errText);
      return NextResponse.json(
        { error: "Webhook failed", details: errText },
        { status: res.status }
      );
    }

    const result = await res.json().catch(() => ({}));
    const first = Array.isArray(result) ? result[0] : result;
    const stats = (first && typeof first === "object") ? first as { sent?: number; failed?: number; total?: number } : {};
    return NextResponse.json({
      success: true,
      result,
      sent: stats.sent,
      failed: stats.failed,
      total: stats.total,
    });
  } catch (error) {
    console.error("WhatsApp bulk send error:", error);
    return NextResponse.json(
      { error: "Failed to send WhatsApp messages" },
      { status: 500 }
    );
  }
}
