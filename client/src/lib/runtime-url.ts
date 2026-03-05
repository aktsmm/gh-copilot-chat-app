import { resolveServerBaseUrl } from "./socket";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function getLocalServerUrl(): string | null {
  try {
    const parsed = new URL(resolveServerBaseUrl());
    const host = parsed.hostname.toLowerCase();
    if (!LOOPBACK_HOSTS.has(host)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
