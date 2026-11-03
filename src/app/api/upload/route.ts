import { NextRequest, NextResponse } from "next/server";
import { getStorage } from "@/lib/server-utils";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST /api/upload - 上传报修图片，返回对象存储 key
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "未找到上传文件" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: "仅支持 JPG/PNG/WebP/GIF 图片" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "图片大小不能超过 5MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const storage = getStorage();
    const key = await storage.uploadFile({
      fileContent: buffer,
      fileName: `repair/${Date.now()}.${ext}`,
      contentType: file.type,
    });

    return NextResponse.json({ success: true, data: { key } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "上传失败";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
