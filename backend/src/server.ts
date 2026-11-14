import app from "./app";
import { env } from "./config/env";

const port = env.port;
const host = env.host;

const server = app.listen(port, host, () => {
  console.log(`i-CAPE API running on http://${host}:${port}`);
  console.log(`Health check: http://${host}:${port}/api/health`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. On macOS, AirPlay Receiver often occupies port 5000 — disable it in System Settings → General → AirDrop & Handoff, or set PORT to another value in .env.`
    );
  } else {
    console.error("Failed to start server:", error.message);
  }
  process.exit(1);
});
