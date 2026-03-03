import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const REQUIRED_NODE_MAJOR = 20;

const result = {
  pass: 0,
  warn: 0,
  fail: 0,
};

function print(level, message) {
  const icon = level === "PASS" ? "✅" : level === "WARN" ? "⚠️" : "❌";
  console.log(`${icon} [${level}] ${message}`);
}

function markPass(message) {
  result.pass += 1;
  print("PASS", message);
}

function markWarn(message) {
  result.warn += 1;
  print("WARN", message);
}

function markFail(message) {
  result.fail += 1;
  print("FAIL", message);
}

function readEnvFile() {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return undefined;

  const raw = fs.readFileSync(envPath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed
      .slice(equalIndex + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (!key) continue;
    env[key] = value;
  }

  return env;
}

function isLocalHostValue(host) {
  if (!host) return true;
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function parseBooleanEnv(raw) {
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

function execute(command, args) {
  return spawnSync(command, args, {
    cwd: rootDir,
    shell: false,
    encoding: "utf8",
    timeout: 15000,
  });
}

function executeShell(command) {
  return spawnSync(command, {
    cwd: rootDir,
    shell: true,
    encoding: "utf8",
    timeout: 15000,
  });
}

function shouldUseShellForCommand(command) {
  if (process.platform !== "win32") return false;
  const normalized = command.trim().toLowerCase();
  return (
    normalized.endsWith(".cmd") ||
    normalized.endsWith(".bat") ||
    normalized.endsWith(".ps1")
  );
}

function quoteForShell(command) {
  if (command.includes('"')) return command;
  return `"${command}"`;
}

function resolveCopilotInvocation(configured) {
  if (configured !== "copilot") {
    if (shouldUseShellForCommand(configured)) {
      return {
        command: `${quoteForShell(configured)} --version`,
        args: [],
        shell: true,
      };
    }
    return { command: configured, args: ["--version"], shell: false };
  }

  if (process.platform === "win32") {
    return { command: "copilot --version", args: [], shell: true };
  }

  return { command: "copilot", args: ["--version"], shell: false };
}

function checkCopilotCli(cliPath) {
  const configured =
    cliPath && cliPath.trim().length > 0 ? cliPath.trim() : "copilot";
  const invocation = resolveCopilotInvocation(configured);
  const check = invocation.shell
    ? executeShell(invocation.command)
    : execute(invocation.command, invocation.args);

  if (check.status === 0) {
    const version = (check.stdout || "").toString().trim().split(/\r?\n/)[0];
    markPass(`Copilot CLI: ${version || "available"}`);
    return;
  }

  const errorLine = (check.stderr || check.stdout || check.error || "")
    .toString()
    .trim();
  markFail(
    `Copilot CLI が見つかりません（cmd: ${invocation.command}）。npm i -g @github/copilot と copilot auth login を実行してください。${errorLine ? ` detail: ${errorLine}` : ""}`,
  );
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= REQUIRED_NODE_MAJOR) {
    markPass(`Node.js ${process.versions.node}`);
  } else {
    markFail(
      `Node.js ${process.versions.node} は非対応です。${REQUIRED_NODE_MAJOR}+ が必要です。`,
    );
  }
}

function checkWorkspaceArtifacts() {
  const requiredPaths = [
    "node_modules",
    "server/package.json",
    "client/package.json",
    "desktop/package.json",
  ];

  const missing = requiredPaths.filter(
    (relativePath) => !fs.existsSync(path.join(rootDir, relativePath)),
  );

  if (missing.length === 0) {
    markPass("workspace 依存関係と構成ファイルを確認");
    return;
  }

  markFail(
    `不足ファイル: ${missing.join(", ")}（npm install を再実行してください）`,
  );
}

function checkEnvHints() {
  const env = readEnvFile();
  if (!env) {
    markWarn(
      ".env が未作成です（必要な場合は .env.example をコピーしてください）",
    );
    return;
  }

  const host = env.HOST;
  if (host && !isLocalHostValue(host)) {
    markWarn(
      `HOST=${host} は外部公開設定です。ローカル開発では HOST=127.0.0.1 を推奨します。`,
    );
  } else {
    markPass(`HOST 設定: ${host || "(default)"}`);
  }

  const corsOrigins = env.CORS_ORIGINS;
  if (corsOrigins && corsOrigins.includes("*")) {
    markWarn(
      "CORS_ORIGINS に '*' が含まれています。許可オリジン最小化を推奨します。",
    );
  } else {
    markPass("CORS_ORIGINS 設定を確認");
  }

  const requireAccessToken =
    parseBooleanEnv(env.REQUIRE_ACCESS_TOKEN) ?? !isLocalHostValue(host);
  const accessToken =
    env.SERVER_ACCESS_TOKEN ||
    env.ACCESS_TOKEN ||
    process.env.SERVER_ACCESS_TOKEN;

  if (requireAccessToken && !accessToken) {
    markFail(
      "非ローカル運用または REQUIRE_ACCESS_TOKEN=true では SERVER_ACCESS_TOKEN（または ACCESS_TOKEN）が必須です。",
    );
  } else if (requireAccessToken) {
    markPass("アクセス制御トークン設定を確認");
  } else {
    markWarn("アクセス制御トークンは未必須です（localhost運用想定）");
  }

  const strictToolPermissions =
    parseBooleanEnv(env.STRICT_TOOL_PERMISSIONS) ?? requireAccessToken;
  if (strictToolPermissions) {
    markPass("厳格ツール権限モード: 有効");
  } else {
    markWarn("厳格ツール権限モード: 無効（互換性優先）");
  }
}

function probePort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error) {
        const code = error.code;
        resolve({
          free: false,
          code: typeof code === "string" ? code : "ERROR",
        });
        return;
      }
      resolve({ free: false, code: "ERROR" });
    });

    server.once("listening", () => {
      server.close(() => resolve({ free: true, code: "OK" }));
    });

    server.listen({ port, host: "127.0.0.1", exclusive: true });
  });
}

async function checkPorts(portList) {
  for (const port of portList) {
    const state = await probePort(port);
    if (state.free) {
      markPass(`Port ${port}: available`);
      continue;
    }

    markFail(
      `Port ${port}: busy (${state.code})。PowerShell: Get-NetTCPConnection -LocalPort ${port} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
    );
  }
}

async function main() {
  console.log("🔎 Running preflight checks for Copilot Chat GUI...\n");

  checkNodeVersion();
  checkWorkspaceArtifacts();
  checkEnvHints();
  checkCopilotCli(process.env.COPILOT_CLI_PATH);

  const env = readEnvFile() ?? {};
  const serverPort = Number(env.PORT ?? process.env.PORT ?? 3001);
  const ports = [serverPort, 5173].filter(
    (value, index, list) =>
      Number.isInteger(value) && value > 0 && list.indexOf(value) === index,
  );
  await checkPorts(ports);

  console.log("\n📋 Summary");
  console.log(`- PASS: ${result.pass}`);
  console.log(`- WARN: ${result.warn}`);
  console.log(`- FAIL: ${result.fail}`);

  if (result.fail > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Preflight checks passed. You can run npm run dev safely.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  markFail(`Preflight execution failed: ${message}`);
  process.exitCode = 1;
});
