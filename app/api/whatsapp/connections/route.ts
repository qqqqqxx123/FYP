import { assertWhatsAppPhoneAvailableForUser } from "@/lib/whatsapp-connection";
import { DUPLICATE_WHATSAPP_NUMBER_MESSAGE } from "@/lib/whatsapp-phone";
import {
  deleteWhatsAppConnectionForUser,
  getWhatsAppConnectionForUser,
  listWhatsAppConnectionsForUser,
  upsertWhatsAppConnectionForUser,
} from "@/lib/nocodb";
import { requireWhatsAppUser } from "@/lib/whatsapp-session";
import { NextResponse } from "next/server";

/**
 * GET: Load the current user's WhatsApp connection from NocoDB.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedSessionId = searchParams.get("sessionId");
    const { userId, sessionId } = await requireWhatsAppUser({
      sessionId: requestedSessionId,
    });
    const connections = await listWhatsAppConnectionsForUser(userId);
    const connection =
      (requestedSessionId
        ? connections.find((item) => item.sessionId === sessionId)
        : connections[0]) ??
      (await getWhatsAppConnectionForUser(userId, sessionId)) ?? {
        userId,
        sessionId,
        status: "disconnected",
      };

    return NextResponse.json({ connections, connection });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "INVALID_SESSION") {
      return NextResponse.json({ message: "Invalid WhatsApp session" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Failed to load connection";
    return NextResponse.json({ message, connections: [], connection: null }, { status: 200 });
  }
}

/**
 * POST: Save the current user's WhatsApp connection. Body: { phone?: string, status: "connected"|"disconnected" }.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = body?.phone != null ? String(body.phone).trim() : null;
    const status = body?.status === "connected" ? "connected" : "disconnected";
    const { userId, sessionId } = await requireWhatsAppUser({
      sessionId: body?.sessionId != null ? String(body.sessionId) : null,
    });

    await assertWhatsAppPhoneAvailableForUser(userId, phone || null, status);
    await upsertWhatsAppConnectionForUser(userId, sessionId, phone || null, status);
    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof Error && error.message === "INVALID_SESSION") {
      return NextResponse.json({ message: "Invalid WhatsApp session" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Failed to save connection";
    const status = message === DUPLICATE_WHATSAPP_NUMBER_MESSAGE ? 409 : 500;
    return NextResponse.json({ message }, { status });
  }
}

/**
 * DELETE: Remove an unused extra WhatsApp slot for the logged-in user.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { userId, sessionId, slot } = await requireWhatsAppUser({
      sessionId: searchParams.get("sessionId"),
    });

    if (slot === 1) {
      return NextResponse.json({ message: "Cannot remove the primary WhatsApp slot" }, { status: 400 });
    }

    const existing = await getWhatsAppConnectionForUser(userId, sessionId);
    if (existing?.status === "connected") {
      return NextResponse.json(
        { message: "Disconnect this WhatsApp session before removing it" },
        { status: 400 }
      );
    }

    await deleteWhatsAppConnectionForUser(userId, sessionId);
    return NextResponse.json({ ok: true, sessionId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "INVALID_SESSION") {
      return NextResponse.json({ message: "Invalid WhatsApp session" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Failed to remove WhatsApp slot";
    return NextResponse.json({ message }, { status: 500 });
  }
}
