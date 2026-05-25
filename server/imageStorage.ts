import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { randomUUID } from "crypto";

function getBucketName(): string | null {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) return null;
  const parts = dir.split("/").filter(Boolean);
  return parts[0] || null;
}

/**
 * Uploads a scorecard image (base64 data URI or Buffer) to Replit Object Storage.
 * Returns a permanent app-relative path like /objects/scans/<uuid>.jpg that can be
 * served via the /objects/* route.
 *
 * Returns null (non-throwing) if Object Storage is not configured or upload fails,
 * so callers can treat this as a best-effort enhancement.
 */
export async function uploadScorecardImage(
  imageData: string | Buffer,
  mimeType: string = "image/jpeg"
): Promise<string | null> {
  try {
    const bucketName = getBucketName();
    if (!bucketName) {
      console.warn("[imageStorage] PRIVATE_OBJECT_DIR not set — skipping durable image upload");
      return null;
    }

    let buffer: Buffer;
    if (typeof imageData === "string") {
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], "base64");
      } else {
        buffer = Buffer.from(imageData, "base64");
      }
    } else {
      buffer = imageData;
    }

    const ext = mimeType.split("/")[1]?.split(";")[0]?.replace("+", "") || "jpg";
    const uuid = randomUUID();
    const objectName = `.private/scans/${uuid}.${ext}`;

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { contentType: mimeType, resumable: false });

    // The /objects/ route handler resolves: /objects/<entityId>
    // where entityId is appended to PRIVATE_OBJECT_DIR = /<bucket>/.private
    // So /objects/scans/<uuid>.ext → /<bucket>/.private/scans/<uuid>.ext ✓
    return `/objects/scans/${uuid}.${ext}`;
  } catch (err) {
    console.error("[imageStorage] Upload failed (non-fatal):", err);
    return null;
  }
}
