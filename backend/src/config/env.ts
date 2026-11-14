import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT) || 5000,
  /** Bind address — production should use 127.0.0.1 behind Nginx */
  host: process.env.HOST || (process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0"),
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl:
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://www.i-cape.com"
      : "http://localhost:3000"),
  /** Public API origin used in signed media URLs */
  apiPublicUrl:
    process.env.API_PUBLIC_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://api.i-cape.com"
      : `http://localhost:${Number(process.env.PORT) || 5000}`),
  databaseUrl: process.env.DATABASE_URL || "",
  authSecret: process.env.AUTH_SECRET || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "",
  s3Endpoint: process.env.S3_ENDPOINT || "",
  s3Bucket: process.env.S3_BUCKET || "",
  s3AccessKey: process.env.S3_ACCESS_KEY || "",
  s3SecretKey: process.env.S3_SECRET_KEY || "",
  s3ForcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true") !== "false",
  s3Region: process.env.S3_REGION || "us-east-1",
  /** Legacy Cloudinary keys — unused when S3 is configured */
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
} as const;
