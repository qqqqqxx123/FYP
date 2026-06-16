import { NextResponse } from "next/server";
import { uploadFileToNocodbStorage } from "@/lib/nocodb-scam-report";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "A valid image file is required" }, { status: 400 });
    }

    const attachment = await uploadFileToNocodbStorage(file);
    return NextResponse.json({ attachment, url: attachment[0]?.url ?? attachment[0]?.path ?? "" });
  } catch (error) {
    console.error("Scam report image upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload image" },
      { status: 500 }
    );
  }
}
