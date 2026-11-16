import { createHmac, timingSafeEqual } from "crypto";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "../config/env";
import { AppError } from "../middleware/error.middleware";

let client: S3Client | null = null;

function requireS3() {
  if (
    !env.s3Endpoint ||
    !env.s3Bucket ||
    !env.s3AccessKey ||
    !env.s3SecretKey
  ) {
    throw new AppError(
      "Object storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.",
      500,
    );
  }
}

function getClient() {
  requireS3();
  if (client) return client;
  client = new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: {
      accessKeyId: env.s3AccessKey,
      secretAccessKey: env.s3SecretKey,
    },
  });
  return client;
}

export function isS3Configured() {
  return Boolean(
    env.s3Endpoint && env.s3Bucket && env.s3AccessKey && env.s3SecretKey,
  );
}

export function publicObjectUrl(key: string) {
  const sig = signObjectKey(key);
  const base = env.apiPublicUrl.replace(/\/$/, "");
  return `${base}/api/public/objects?key=${encodeURIComponent(key)}&sig=${sig}`;
}

export function signObjectKey(key: string) {
  if (!env.authSecret) {
    throw new AppError("AUTH_SECRET is required for signed object URLs", 500);
  }
  return createHmac("sha256", env.authSecret).update(key).digest("hex").slice(0, 40);
}

export function verifyObjectSignature(key: string, sig: string) {
  try {
    const expected = Buffer.from(signObjectKey(key), "utf8");
    const got = Buffer.from(sig || "", "utf8");
    if (expected.length !== got.length) return false;
    return timingSafeEqual(expected, got);
  } catch {
    return false;
  }
}

export async function ensureBucket() {
  const s3 = getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
  }
}

export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}) {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
  return {
    key: params.key,
    bucket: env.s3Bucket,
    url: publicObjectUrl(params.key),
  };
}

export async function getObjectStream(key: string) {
  const s3 = getClient();
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
    }),
  );
  if (!result.Body) {
    throw new AppError("Object not found in storage", 404);
  }
  return {
    body: result.Body,
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength,
  };
}

export async function deleteObject(key: string) {
  const s3 = getClient();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
    }),
  );
}

export function sanitizeObjectBaseName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").slice(0, 40);
  const safe = base.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-");
  return safe || "file";
}

export function extensionFor(fileName: string, mimeType: string) {
  const fromName = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
    : "";
  if (fromName && fromName.length <= 8) return fromName;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

/** Payment proof upload (replaces Cloudinary). */
export async function uploadPaymentProof(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
) {
  const ext = extensionFor(fileName, mimeType);
  const key = `payment-proofs/${Date.now()}-${sanitizeObjectBaseName(fileName)}${ext}`;
  const uploaded = await putObject({
    key,
    body: buffer,
    contentType: mimeType || "application/octet-stream",
  });
  return {
    url: uploaded.url,
    publicId: uploaded.key,
  };
}

export function isS3KeyRef(filePath: string | null | undefined) {
  return Boolean(filePath && filePath.startsWith("s3:"));
}

export function toS3KeyRef(key: string) {
  return `s3:${key}`;
}

export function fromS3KeyRef(filePath: string) {
  return filePath.replace(/^s3:/, "");
}
