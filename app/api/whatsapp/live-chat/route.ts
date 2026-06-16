import { NextRequest, NextResponse } from "next/server";
import {
  getMemberByPhone,
  getOtherPhoneFromConversationId,
  updateMemberLiveChat,
} from "@/lib/wooztell";

/**
 * GET /api/whatsapp/live-chat?conversationId=...
 * Returns current live chat status for the conversation's customer (Wooztell member).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId")?.trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  try {
    const phone = getOtherPhoneFromConversationId(conversationId);
    if (!phone) {
      return NextResponse.json(
        { error: "Could not resolve customer phone from conversation" },
        { status: 400 }
      );
    }
    const member = await getMemberByPhone(phone);
    if (!member) {
      return NextResponse.json(
        { error: "Member not found for this conversation" },
        { status: 404 }
      );
    }
    return NextResponse.json({ liveChat: member.liveChat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get live chat status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/live-chat
 * Body: { conversationId: string, liveChat?: boolean }
 * If liveChat is omitted, toggles current value. Returns new { liveChat }.
 */
export async function POST(request: NextRequest) {
  let body: { conversationId?: string; liveChat?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const conversationId = body.conversationId?.trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    );
  }

  try {
    const phone = getOtherPhoneFromConversationId(conversationId);
    if (!phone) {
      return NextResponse.json(
        { error: "Could not resolve customer phone from conversation" },
        { status: 400 }
      );
    }
    const member = await getMemberByPhone(phone);
    if (!member) {
      return NextResponse.json(
        { error: "Member not found for this conversation" },
        { status: 404 }
      );
    }

    const newLiveChat =
      typeof body.liveChat === "boolean"
        ? body.liveChat
        : !member.liveChat;

    await updateMemberLiveChat(member.memberId, newLiveChat);
    return NextResponse.json({ liveChat: newLiveChat });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update live chat";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
