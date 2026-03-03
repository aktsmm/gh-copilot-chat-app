/**
 * Embedded Express + Socket.IO server for the Electron desktop app.
 *
 * This module reuses the same server code but runs it within the
 * Electron main process, serving the pre-built client assets.
 */

import express from "express";
import cors from "cors";
import { createServer, type Server as HTTPServer } from "node:http";
import { Server as SocketIO } from "socket.io";
import path from "node:path";
import { app as electronApp } from "electron";

// We import server modules directly from the server workspace
// In development, this points to ../server/src
// In production (packaged), this points to the bundled server
import { apiRouter } from "../../server/src/routes/api.js";
import { registerSocketHandlers } from "../../server/src/socket/handlers.js";
import { stopClient } from "../../server/src/copilot/client-manager.js";
import {
  config,
  hasValidAccessToken,
  isCorsOriginAllowed,
} from "../../server/src/config.js";

let httpServer: HTTPServer | null = null;

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

function resolveHeaderToken(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const authHeader =
    typeof headers.authorization === "string"
      ? headers.authorization
      : undefined;
  const bearerToken = resolveBearerToken(authHeader);
  if (bearerToken) return bearerToken;

  const customHeader = headers["x-access-token"];
  if (typeof customHeader === "string" && customHeader.trim().length > 0) {
    return customHeader.trim();
  }

  return undefined;
}

function hasTrustedOrigin(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  const origin = headers.origin;
  if (typeof origin !== "string") {
    return false;
  }
  return isCorsOriginAllowed(origin);
}

function listenOnPort(
  server: HTTPServer,
  port: number,
  host: string,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const cleanup = () => {
      server.off("error", onError);
      server.off("listening", onListening);
    };

    const onError = (err: NodeJS.ErrnoException) => {
      cleanup();
      reject(err);
    };

    const onListening = () => {
      cleanup();
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      resolve(boundPort);
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * Start the embedded HTTP + WS server.
 * @returns The port the server is listening on.
 */
export async function startEmbeddedServer(): Promise<number> {
  const expressApp = express();
  expressApp.use(
    cors({
      origin: resolveCorsOrigin,
    }),
  );
  expressApp.use(express.json());

  expressApp.use("/api", (req, res, next) => {
    const token = resolveRequestToken(req);
    const trustedOrigin = hasTrustedOrigin(req.headers);

    if (!trustedOrigin && !hasValidAccessToken(token)) {
      res.status(403).json({ error: "Forbidden origin" });
      return;
    }

    if (config.security.requireAccessToken && !hasValidAccessToken(token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  });

  // API routes
  expressApp.use("/api", apiRouter);

  // Serve the built client assets
  const clientDist = electronApp.isPackaged
    ? path.join(process.resourcesPath, "client")
    : path.resolve(electronApp.getAppPath(), "../client/dist");

  expressApp.use(express.static(clientDist));
  expressApp.get("/{*path}", (_req, res, next) => {
    if (_req.path.startsWith("/api") || _req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });

  // Create HTTP + Socket.IO server
  httpServer = createServer(expressApp);
  const io = new SocketIO(httpServer, {
    cors: { origin: resolveCorsOrigin, methods: ["GET", "POST"] },
    allowRequest: (req, callback) => {
      const trustedOrigin = hasTrustedOrigin(req.headers);
      const token = resolveHeaderToken(req.headers);

      if (!trustedOrigin && !hasValidAccessToken(token)) {
        callback("Forbidden origin", false);
        return;
      }

      if (config.security.requireAccessToken && !hasValidAccessToken(token)) {
        callback("Unauthorized", false);
        return;
      }

      callback(null, true);
    },
    transports: ["websocket", "polling"],
  });

  io.use((socket, next) => {
    const authPayload =
      socket.handshake.auth && typeof socket.handshake.auth === "object"
        ? (socket.handshake.auth as Record<string, unknown>)
        : {};

    const authToken =
      typeof authPayload.token === "string" ? authPayload.token.trim() : "";
    const headerToken = resolveHeaderToken(socket.handshake.headers);
    const token = authToken || headerToken;
    const trustedOrigin = hasTrustedOrigin(socket.handshake.headers);

    if (!trustedOrigin && !hasValidAccessToken(token)) {
      next(new Error("Forbidden origin"));
      return;
    }

    if (config.security.requireAccessToken && !hasValidAccessToken(token)) {
      next(new Error("Unauthorized"));
      return;
    }

    next();
  });

  registerSocketHandlers(io);

  // Find an available port (try 3002 to avoid dev server conflict, then random)
  const host = "127.0.0.1";
  try {
    const port = await listenOnPort(httpServer, 3002, host);
    console.log(`[embedded-server] Listening on http://${host}:${port}`);
    return port;
  } catch (err) {
    const listenError = err as NodeJS.ErrnoException;
    if (listenError.code !== "EADDRINUSE") {
      throw err;
    }
  }

  const fallbackPort = await listenOnPort(httpServer, 0, host);
  console.log(`[embedded-server] Listening on http://${host}:${fallbackPort}`);
  return fallbackPort;
}

/**
 * Stop the embedded server and clean up Copilot SDK resources.
 */
export async function stopEmbeddedServer(): Promise<void> {
  await stopClient();
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }
  console.log("[embedded-server] Stopped");
}
