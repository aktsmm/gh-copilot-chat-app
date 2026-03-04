/**
 * Centralised configuration — reads from environment / .env
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PERMISSION_KINDS = [
  "shell",
  "write",
  "mcp",
  "read",
  "url",
  "custom-tool",
] as const;
type PermissionKind = (typeof PERMISSION_KINDS)[number];
const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://[::1]:5173",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://[::1]:3001",
];
const DOMAIN_HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;
const IPV4_HOST_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_HOST_PATTERN = /^[0-9a-f:]+$/i;

function toCanonicalOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function parseCorsOrigins(raw: string | undefined): Set<string> {
  const defaults = new Set(DEFAULT_CORS_ORIGINS);

  if (!raw || raw.trim().length === 0) {
    return defaults;
  }

  const parsed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parsed.includes("*")) {
    throw new Error(
      "CORS_ORIGINS cannot include '*'. Specify explicit origins instead.",
    );
  }

  const configured = new Set<string>();
  for (const entry of parsed) {
    const canonical = toCanonicalOrigin(entry);
    if (canonical) {
      configured.add(canonical);
    }
  }

  if (configured.size === 0) {
    throw new Error(
      "CORS_ORIGINS was provided, but no valid http(s) origins were found.",
    );
  }

  if (process.env.NODE_ENV !== "production") {
    for (const localOrigin of defaults) {
      configured.add(localOrigin);
    }
  }

  return configured;
}

function parseBooleanEnv(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return undefined;
}

function parsePort(raw: string | undefined): number {
  const value = raw?.trim() ?? "3001";
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535. Received: '${value}'`,
    );
  }

  return port;
}

function parsePositiveIntegerEnv(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw || raw.trim().length === 0) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseCommaSeparatedEnv(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return [];
  const parsed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...new Set(parsed)];
}

function includesNodeModulesBinPath(candidate: string): boolean {
  return candidate
    .toLowerCase()
    .replaceAll("/", "\\")
    .includes("\\node_modules\\.bin\\");
}

function isWindowsCommandShim(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function isValidIpv4Host(host: string): boolean {
  if (!IPV4_HOST_PATTERN.test(host)) return false;
  return host.split(".").every((segment) => {
    const value = Number(segment);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function isValidIpv6Host(host: string): boolean {
  return (
    host.includes(":") &&
    IPV6_HOST_PATTERN.test(host) &&
    !host.includes(":::")
  );
}

function normalizeWebSearchAllowedHost(host: string): string | null {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("://")) return null;
  if (normalized.includes("*") || /[\s/?#]/.test(normalized)) return null;

  const unwrapped =
    normalized.startsWith("[") && normalized.endsWith("]")
      ? normalized.slice(1, -1)
      : normalized;

  if (!unwrapped) return null;
  if (unwrapped === "localhost") return unwrapped;
  if (isValidIpv4Host(unwrapped)) return unwrapped;
  if (isValidIpv6Host(unwrapped)) return unwrapped;
  if (DOMAIN_HOST_PATTERN.test(unwrapped)) return unwrapped;

  return null;
}

export function parseWebSearchFallbackAllowedUrls(
  raw: string | undefined,
): string[] {
  const parsed = parseCommaSeparatedEnv(raw);
  if (parsed.length === 0) return [];

  const invalidEntries: string[] = [];
  const normalizedEntries: string[] = [];

  for (const entry of parsed) {
    const normalized = normalizeWebSearchAllowedHost(entry);
    if (normalized) {
      normalizedEntries.push(normalized);
      continue;
    }
    invalidEntries.push(entry);
  }

  if (invalidEntries.length > 0) {
    throw new Error(
      `WEB_SEARCH_FALLBACK_ALLOWED_URLS contains invalid host entries: ${invalidEntries.join(", ")}. Use host/domain values only (e.g. example.com).`,
    );
  }

  return [...new Set(normalizedEntries)];
}

function parseOptionalStringEnv(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = normalizeHost(host);
  return LOOPBACK_HOSTS.has(normalized) || normalized === "::1";
}

export function parseAllowedPermissionKinds(
  raw: string | undefined,
): PermissionKind[] {
  if (!raw || raw.trim().length === 0) {
    return ["read", "url", "mcp"];
  }

  const entries = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  const invalidEntries = entries.filter(
    (value) => !(PERMISSION_KINDS as readonly string[]).includes(value),
  );

  if (invalidEntries.length > 0) {
    throw new Error(
      `PERMISSION_ALLOW_KINDS contains invalid kinds: ${invalidEntries.join(", ")}. Allowed values: ${PERMISSION_KINDS.join(", ")}`,
    );
  }

  const parsed = entries
    .filter((value): value is PermissionKind =>
      (PERMISSION_KINDS as readonly string[]).includes(value),
    );

  return parsed.length > 0 ? [...new Set(parsed)] : ["read", "url", "mcp"];
}

export function selectWindowsCopilotCliCandidate(
  candidates: string[],
): string | undefined {
  const normalizedCandidates = candidates
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const nonNodeModulesExe = normalizedCandidates.find((candidate) => {
    const lower = candidate.toLowerCase();
    return lower.endsWith(".exe") && !includesNodeModulesBinPath(candidate);
  });
  if (nonNodeModulesExe) {
    return nonNodeModulesExe;
  }

  const anyExe = normalizedCandidates.find((candidate) =>
    candidate.toLowerCase().endsWith(".exe"),
  );
  if (anyExe) {
    return anyExe;
  }

  const nonNodeModulesNonShim = normalizedCandidates.find(
    (candidate) =>
      !includesNodeModulesBinPath(candidate) &&
      !isWindowsCommandShim(candidate),
  );
  if (nonNodeModulesNonShim) {
    return nonNodeModulesNonShim;
  }

  return undefined;
}

function resolveWindowsCopilotCliPath(): string {
  try {
    const output = execFileSync("where", ["copilot"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    const candidates = output
      .split(/\r?\n/g)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const selected = selectWindowsCopilotCliCandidate(candidates);
    if (selected) {
      return selected;
    }
  } catch {
    // fallback below
  }

  return "copilot.exe";
}

const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
const configuredHost = (process.env.HOST ?? "127.0.0.1").trim();
if (configuredHost.length === 0) {
  throw new Error("HOST must not be empty.");
}
const configuredPort = parsePort(process.env.PORT);
const accessToken =
  process.env.SERVER_ACCESS_TOKEN?.trim() ||
  process.env.ACCESS_TOKEN?.trim() ||
  undefined;
const requireAccessToken =
  parseBooleanEnv(process.env.REQUIRE_ACCESS_TOKEN) ??
  !isLoopbackHost(configuredHost);
const strictToolPermissions =
  parseBooleanEnv(process.env.STRICT_TOOL_PERMISSIONS) ?? requireAccessToken;
const enableWebSearchFallback =
  parseBooleanEnv(process.env.ENABLE_WEB_SEARCH_FALLBACK) ??
  process.env.NODE_ENV !== "production";
const webSearchFallbackModel =
  process.env.WEB_SEARCH_FALLBACK_MODEL?.trim() || "gpt-5-mini";
const DEFAULT_WEB_SEARCH_FALLBACK_ALLOWED_URLS = [
  "weather.gov",
  "www.jma.go.jp",
  "tenki.jp",
  "www.bbc.com",
  "www.reuters.com",
  "apnews.com",
  "www.nhk.or.jp",
  "www.nikkei.com",
] as const;
const webSearchFallbackAllowAllUrls =
  parseBooleanEnv(process.env.WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS) ?? false;
const webSearchFallbackAllowedUrls = (() => {
  const configured = parseWebSearchFallbackAllowedUrls(
    process.env.WEB_SEARCH_FALLBACK_ALLOWED_URLS,
  );
  if (configured.length > 0) {
    return configured;
  }
  if (webSearchFallbackAllowAllUrls) {
    return [];
  }
  return [...DEFAULT_WEB_SEARCH_FALLBACK_ALLOWED_URLS];
})();
if (
  process.env.NODE_ENV === "production" &&
  webSearchFallbackAllowAllUrls
) {
  console.warn(
    "[config] WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS=true in production is discouraged. Prefer explicit WEB_SEARCH_FALLBACK_ALLOWED_URLS.",
  );
}
const webSearchFallbackTimeoutMs = parsePositiveIntegerEnv(
  process.env.WEB_SEARCH_FALLBACK_TIMEOUT_MS,
  90_000,
);
const webSearchFallbackDefaultLocation = parseOptionalStringEnv(
  process.env.WEB_SEARCH_FALLBACK_DEFAULT_LOCATION,
);
const webSearchFallbackDefaultLocale = parseOptionalStringEnv(
  process.env.WEB_SEARCH_FALLBACK_DEFAULT_LOCALE,
);
const webSearchFallbackDefaultTimeZone = parseOptionalStringEnv(
  process.env.WEB_SEARCH_FALLBACK_DEFAULT_TIMEZONE,
);
const chatErrorUnknownWarnThreshold = parsePositiveIntegerEnv(
  process.env.CHAT_ERROR_UNKNOWN_WARN_THRESHOLD,
  10,
);
const allowedPermissionKinds = parseAllowedPermissionKinds(
  process.env.PERMISSION_ALLOW_KINDS,
);

if (requireAccessToken && !accessToken) {
  throw new Error(
    "SERVER_ACCESS_TOKEN (or ACCESS_TOKEN) is required when HOST is not loopback or REQUIRE_ACCESS_TOKEN=true.",
  );
}

function resolveCopilotCliPath(): string {
  const envCliPath = process.env.COPILOT_CLI_PATH?.trim();
  if (envCliPath && envCliPath.length > 0) {
    if (process.platform === "win32" && isWindowsCommandShim(envCliPath)) {
      const adjacentExe = envCliPath.replace(/\.(cmd|bat)$/i, ".exe");
      if (adjacentExe !== envCliPath && fs.existsSync(adjacentExe)) {
        return adjacentExe;
      }

      const selected = resolveWindowsCopilotCliPath();
      if (selected !== "copilot.exe") {
        return selected;
      }
      return "copilot.exe";
    }
    return envCliPath;
  }

  if (process.platform === "win32") {
    return resolveWindowsCopilotCliPath();
  }

  const cliFile = "copilot";
  const candidates = [
    path.resolve(process.cwd(), "node_modules", ".bin", cliFile),
    path.resolve(process.cwd(), "..", "node_modules", ".bin", cliFile),
  ].filter((value): value is string => Boolean(value));

  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (resolved) return resolved;

  return envCliPath && envCliPath.length > 0 ? envCliPath : "copilot";
}

export const config = {
  server: {
    port: configuredPort,
    host: configuredHost,
  },
  cors: {
    origins: Array.from(corsOrigins),
  },
  security: {
    requireAccessToken,
    accessToken,
    strictToolPermissions,
    allowedPermissionKinds,
  },
  github: {
    token:
      process.env.GITHUB_TOKEN ??
      process.env.GH_TOKEN ??
      process.env.COPILOT_GITHUB_TOKEN,
  },
  byok: {
    provider: process.env.BYOK_PROVIDER,
    apiKey: process.env.BYOK_API_KEY,
    baseUrl: process.env.BYOK_BASE_URL,
    model: process.env.BYOK_MODEL,
  },
  copilot: {
    cliPath: resolveCopilotCliPath(),
    logLevel: process.env.COPILOT_LOG_LEVEL ?? "info",
    enableWebSearchFallback,
    webSearchFallbackModel,
    webSearchFallbackAllowAllUrls,
    webSearchFallbackAllowedUrls,
    webSearchFallbackTimeoutMs,
    webSearchFallbackDefaultLocation,
    webSearchFallbackDefaultLocale,
    webSearchFallbackDefaultTimeZone,
  },
  observability: {
    chatErrorUnknownWarnThreshold,
  },
} as const;

export function isCorsOriginAllowed(origin: string | undefined): boolean {
  if (!origin || origin.trim().length === 0) {
    return true;
  }

  const canonicalOrigin = toCanonicalOrigin(origin.trim());
  if (!canonicalOrigin) {
    return false;
  }

  if (corsOrigins.has(canonicalOrigin)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    try {
      const parsed = new URL(canonicalOrigin);
      return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  return false;
}

export function hasValidAccessToken(candidate: string | undefined): boolean {
  if (!config.security.requireAccessToken) {
    return true;
  }

  if (!candidate || !config.security.accessToken) {
    return false;
  }

  return candidate === config.security.accessToken;
}
