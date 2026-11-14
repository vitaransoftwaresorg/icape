import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import apiRouter from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware";

const app = express();

// Nginx terminates TLS and sets X-Forwarded-*; required for express-rate-limit.
if (env.nodeEnv === "production") {
  app.set("trust proxy", 1);
}

function isAllowedOrigin(origin: string | undefined) {
  if (!origin) return true;
  const allowed = new Set([
    env.frontendUrl.replace(/\/$/, ""),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://www.i-cape.com",
    "https://i-cape.com",
  ]);
  if (allowed.has(origin.replace(/\/$/, ""))) return true;
  // Allow www / apex variants of the configured frontend host
  try {
    const host = new URL(origin).hostname.replace(/^www\./, "");
    const configured = new URL(env.frontendUrl).hostname.replace(/^www\./, "");
    return host === configured;
  } catch {
    return false;
  }
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Intentionally NO global rate limit — admin must not be throttled.
// Public result routes apply their own limiter in result.routes.ts.

function sendApiRoot(_req: express.Request, res: express.Response) {
  res.status(200).json({
    success: true,
    message: "i-CAPE API",
    data: { health: "/api/health" },
  });
}

app.get("/api", sendApiRoot);
app.get("/api/", sendApiRoot);

// Canonical mount
app.use("/api", apiRouter);
// Fallback when NEXT_PUBLIC_API_URL omits /api (common production misconfig)
app.use(apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);


export default app;
