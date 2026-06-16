import { NextResponse } from "next/server";

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL?.replace(/\/$/, "");
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID;
const JW_PHOTOS_TABLE_ID = process.env.JW_PHOTOS_TABLE_ID || "JW Photos";

export async function POST(request: Request) {
  try {
    if (!NOCODB_BASE_URL || !NOCODB_API_TOKEN || !NOCODB_BASE_ID) {
      return NextResponse.json(
        { error: "NocoDB configuration missing" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const photoName = formData.get("photoName") as string;
    const source = formData.get("source") as string;
    const file = formData.get("file") as File | null;
    const googleDriveUrl = formData.get("googleDriveUrl") as string | null;

    if (!photoName) {
      return NextResponse.json(
        { error: "Photo name is required" },
        { status: 400 }
      );
    }

    let photoUrl: string | null = null;
    let attachmentData: unknown[] = [];

    // Handle local file upload
    if (source === "Local" && file) {
      // Upload file to NocoDB
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const uploadRes = await fetch(
        `${NOCODB_BASE_URL}/api/v2/storage/upload`,
        {
          method: "POST",
          headers: {
            "xc-token": NOCODB_API_TOKEN,
          },
          body: uploadFormData,
        }
      );

      if (!uploadRes.ok) {
        throw new Error("Failed to upload file to NocoDB storage");
      }

      const uploadResult = (await uploadRes.json()) as Array<{
        url?: string;
        path?: string;
        title?: string;
        mimetype?: string;
        size?: number;
      }>;

      if (uploadResult && uploadResult.length > 0) {
        const uploaded = uploadResult[0];
        photoUrl = uploaded.url || uploaded.path || null;
        attachmentData = [
          {
            url: photoUrl,
            title: uploaded.title || file.name,
            mimetype: uploaded.mimetype || file.type,
            size: uploaded.size || file.size,
          },
        ];
      }
    } else if (source === "Google Drive" && googleDriveUrl) {
      // For Google Drive, store the URL directly
      photoUrl = googleDriveUrl;
      attachmentData = [
        {
          url: googleDriveUrl,
          title: photoName,
          mimetype: "image/*",
        },
      ];
    }

    // Generate a unique Photo_ID
    const photoId = `IMG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create record in JW Photos table
    const recordPayload = {
      Photo_ID: photoId,
      "Photo Name": photoName,
      Photo: attachmentData,
      Source: source,
    };

    const createRes = await fetch(
      `${NOCODB_BASE_URL}/api/v2/tables/${JW_PHOTOS_TABLE_ID}/records`,
      {
        method: "POST",
        headers: {
          "xc-token": NOCODB_API_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(recordPayload),
      }
    );

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error("NocoDB create error:", errorText);
      throw new Error("Failed to create record in NocoDB");
    }

    const result = await createRes.json();

    return NextResponse.json({
      success: true,
      photoId,
      photoUrl,
      result,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
