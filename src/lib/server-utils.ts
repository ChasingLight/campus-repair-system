import { S3Storage } from "coze-coding-dev-sdk";

let storageInstance: S3Storage | null = null;

export function getStorage(): S3Storage {
  if (!storageInstance) {
    storageInstance = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });
  }
  return storageInstance;
}

/** 为工单图片 key 批量生成签名 URL（key -> url） */
export async function signImageKeys(keys: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const storage = getStorage();
  await Promise.all(
    keys.map(async (key) => {
      try {
        result[key] = await storage.generatePresignedUrl({ key, expireTime: 86400 });
      } catch {
        result[key] = "";
      }
    }),
  );
  return result;
}

/** 生成工单编号：BX20251103-XXXX */
export function genTicketNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BX${y}${m}${d}-${rand}`;
}
