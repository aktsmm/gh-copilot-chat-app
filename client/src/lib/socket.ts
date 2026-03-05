/**
 * Socket.IO client singleton — connects to the server backend.
 */
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function resolveServerBaseUrl(): string {
  const configuredUrl =
    typeof import.meta.env.VITE_SERVER_URL === "string"
      ? import.meta.env.VITE_SERVER_URL.trim()
      : "";

  if (configuredUrl.length > 0) {
    return configuredUrl;
  }

  return window.location.origin;
}

export function getSocket(): Socket {
  if (!socket) {
    const url = resolveServerBaseUrl();
    const accessToken =
      typeof import.meta.env.VITE_SERVER_ACCESS_TOKEN === "string"
        ? import.meta.env.VITE_SERVER_ACCESS_TOKEN.trim()
        : "";

    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      auth: accessToken.length > 0 ? { token: accessToken } : undefined,
    });

    socket.on("connect", () => console.log("[ws] Connected"));
    socket.on("disconnect", () => console.log("[ws] Disconnected"));
  }
  return socket;
}
