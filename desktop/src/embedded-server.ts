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
import { existsSync } from "node:fs";
import { app as electronApp } from "electron";

let httpServer: HTTPServer | null = null;

type ServerDeps = {
  apiRouter: express.Router;
  registerSocketHandlers: (io: SocketIO) => void;
  stopClient: () => Promise<void>;
  config: {
    security: {
      requireAccessToken: boolean;
    };
  };
  hasValidAccessToken: (token: string | undefined) => boolean;
  isCorsOriginAllowed: (origin: string | undefined) => boolean;
};

let serverDepsPromise: Promise<ServerDeps> | null = null;

function loadServerDeps(): Promise<ServerDeps> {
  if (!serverDepsPromise) {
    serverDepsPromise = Promise.all([
      import("../../server/src/routes/api.js"),
      import("../../server/src/socket/handlers.js"),
      import("../../server/src/copilot/client-manager.js"),
      import("../../server/src/config.js"),
    ]).then(([routeModule, socketModule, clientModule, configModule]) => ({
      apiRouter: routeModule.apiRouter,
      registerSocketHandlers: socketModule.registerSocketHandlers,
      stopClient: clientModule.stopClient,
      config: configModule.config,
      hasValidAccessToken: configModule.hasValidAccessToken,
      isCorsOriginAllowed: configModule.isCorsOriginAllowed,
    }));
  }

  return serverDepsPromise;
}

function resolveClientDistPath(): string {
  if (!electronApp.isPackaged) {
    return path.resolve(electronApp.getAppPath(), "../client/dist");
  }

  const asarClient = path.join(electronApp.getAppPath(), "client");
  if (existsSync(asarClient)) {
    return asarClient;
  }

  const legacyResourceClient = path.join(process.resourcesPath, "client");
  if (existsSync(legacyResourceClient)) {
    return legacyResourceClient;
  }

  return asarClient;
}

function resolveCorsOrigin(
  origin: string | undefined,
  isCorsOriginAllowed: (origin: string | undefined) => boolean,
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
  isCorsOriginAllowed: (origin: string | undefined) => boolean,
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
  const {
    apiRouter,
    registerSocketHandlers,
    config,
    hasValidAccessToken,
    isCorsOriginAllowed,
  } = await loadServerDeps();

  const expressApp = express();
  expressApp.use(
    cors({
      origin: (origin, callback) =>
        resolveCorsOrigin(origin, isCorsOriginAllowed, callback),
    }),
  );
  expressApp.use(express.json());

  expressApp.use("/api", (req, res, next) => {
    const token = resolveRequestToken(req);
    const trustedOrigin = hasTrustedOrigin(req.headers, isCorsOriginAllowed);

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
  const clientDist = resolveClientDistPath();

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
    cors: {
      origin: (origin, callback) =>
        resolveCorsOrigin(origin, isCorsOriginAllowed, callback),
      methods: ["GET", "POST"],
    },
    allowRequest: (req, callback) => {
      const trustedOrigin = hasTrustedOrigin(req.headers, isCorsOriginAllowed);
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
    const trustedOrigin = hasTrustedOrigin(
      socket.handshake.headers,
      isCorsOriginAllowed,
    );

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
  if (serverDepsPromise) {
    try {
      const { stopClient } = await serverDepsPromise;
      await stopClient();
    } catch {}
  }
  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer!.close(() => resolve());
    });
    httpServer = null;
  }
  console.log("[embedded-server] Stopped");
}
