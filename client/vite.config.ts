import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

type RootPackageJson = {
  version?: unknown;
  author?: unknown;
  repository?: unknown;
};

function normalizeHttpUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    const normalized = parsed.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return "";
  }
}

function normalizeRepositoryUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  let candidate = trimmed;
  if (trimmed.startsWith("git+")) {
    candidate = trimmed.slice(4);
  } else if (trimmed.startsWith("git@github.com:")) {
    candidate = `https://github.com/${trimmed.slice("git@github.com:".length)}`;
  }

  return normalizeHttpUrl(candidate.replace(/\.git$/i, ""));
}

function readRootPackageJson(): RootPackageJson {
  try {
    return JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
    ) as RootPackageJson;
  } catch {
    return {};
  }
}

const rootPackageJson = readRootPackageJson();

const appVersion =
  typeof rootPackageJson.version === "string"
    ? rootPackageJson.version
    : "0.0.0";
const appSignature =
  typeof rootPackageJson.author === "string" ? rootPackageJson.author : "";
const appRepositoryUrl =
  typeof rootPackageJson.repository === "string"
    ? normalizeRepositoryUrl(rootPackageJson.repository)
    : rootPackageJson.repository && typeof rootPackageJson.repository === "object"
      ? normalizeRepositoryUrl(
          typeof (rootPackageJson.repository as { url?: unknown }).url ===
            "string"
            ? (rootPackageJson.repository as { url: string }).url
            : "",
        )
      : "";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serverTarget = env.VITE_SERVER_URL || "http://127.0.0.1:3001";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": serverTarget,
        "/socket.io": {
          target: serverTarget,
          ws: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
            markdown: ["react-markdown", "remark-gfm"],
            syntax: ["react-syntax-highlighter"],
            socketio: ["socket.io-client"],
          },
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_SIGNATURE__: JSON.stringify(appSignature),
      __APP_REPOSITORY_URL__: JSON.stringify(appRepositoryUrl),
    },
  };
});
