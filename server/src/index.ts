/**
 * Server entry point.
 *
 * Express + Socket.IO server that bridges the browser UI to the Copilot SDK.
 */

import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server as SocketIO } from "socket.io";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config, hasValidAccessToken, isCorsOriginAllowed } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { registerSocketHandlers } from "./socket/handlers.js";
import { stopClient } from "./copilot/client-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveCorsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) {
  if (isCorsOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error("Not allowed by CORS"));
}

function resolveBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim() || undefined;
  }
  return undefined;
}

function resolveRequestToken(req: express.Request): string | undefined {
  const authHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization
      : undefined;
  const bearerToken = resolveBearerToken(authHeader);
  if (bearerToken) return bearerToken;

  const customHeader = req.headers["x-access-token"];
  if (typeof customHeader === "string" && customHeader.trim().length > 0) {
    return customHeader.trim();
  }

  return undefined;
}

const app = express();
app.use(
  cors({
    origin: resolveCorsOrigin,
  }),
);
app.use(express.json());

if (config.security.requireAccessToken) {
  app.use("/api", (req, res, next) => {
    const token = resolveRequestToken(req);
    if (!hasValidAccessToken(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });
}

// ── API routes ──────────────────────────────────────────────
app.use("/api", apiRouter);

// ── Serve built client in production ────────────────────────
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/{*path}", (_req, res, next) => {
  // Only serve index.html for non-API, non-socket paths
  if (_req.path.startsWith("/api") || _req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"));
});

// ── HTTP + WebSocket server ─────────────────────────────────
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: resolveCorsOrigin, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});

if (config.security.requireAccessToken) {
  io.use((socket, next) => {
    const authPayload =
      socket.handshake.auth && typeof socket.handshake.auth === "object"
        ? (socket.handshake.auth as Record<string, unknown>)
        : {};

    const authToken =
      typeof authPayload.token === "string" ? authPayload.token.trim() : "";

    const headerAuth =
      typeof socket.handshake.headers.authorization === "string"
        ? socket.handshake.headers.authorization
        : undefined;
    const headerToken = resolveBearerToken(headerAuth);

    const customHeader = socket.handshake.headers["x-access-token"];
    const customToken =
      typeof customHeader === "string" ? customHeader.trim() : undefined;

    const token = authToken || headerToken || customToken;
    if (!hasValidAccessToken(token)) {
      next(new Error("Unauthorized"));
      return;
    }

    next();
  });
}

registerSocketHandlers(io);

httpServer.listen(config.server.port, config.server.host, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🚀 Copilot Chat GUI — Server Running      ║
║   http://${config.server.host}:${config.server.port}                  ║
╚══════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
let shuttingDown = false;

async function gracefulShutdown(signal: "SIGINT" | "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[server] ${signal} received, shutting down…`);

  try {
    await stopClient();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    process.exit(0);
  } catch (error) {
    console.error("[server] Failed during shutdown:", error);
    process.exit(1);
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void gracefulShutdown(sig);
  });
}
