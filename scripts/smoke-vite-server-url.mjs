import net from "node:net";
import { spawn } from "node:child_process";

const SERVER_PORT = Number(process.env.PORT ?? 3001);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);
const HOST = "127.0.0.1";
const DEFAULT_TIMEOUT_MS = 45_000;
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const viteServerUrl =
  typeof process.env.VITE_SERVER_URL === "string"
    ? process.env.VITE_SERVER_URL.trim()
    : "";

const logs = {
  server: [],
  client: [],
};

function pushLog(target, line) {
  if (!line) return;
  logs[target].push(line);
  if (logs[target].length > 80) {
    logs[target].shift();
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortBusy(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: HOST, port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function assertPortFree(port, label) {
  const busy = await isPortBusy(port);
  if (!busy) return;
  throw new Error(
    `${label} port ${port} is already in use. Stop the process and retry.`,
  );
}

function spawnNpm(args, label, extraEnv) {
  const isWin = process.platform === "win32";
  const child = isWin
    ? spawn(`npm ${args.join(" ")}`, {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...extraEnv,
        },
        windowsHide: true,
      })
    : spawn("npm", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...extraEnv,
        },
      });

  if (!child.stdout || !child.stderr) {
    throw new Error(`Failed to spawn ${label} process`);
  }

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) pushLog(label, line);
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) pushLog(label, line);
    }
  });

  child.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    pushLog(label, `[spawn-error] ${message}`);
  });

  child.on("exit", (code, signal) => {
    pushLog(label, `[exit] code=${code ?? "null"} signal=${signal ?? "null"}`);
  });

  return child;
}

async function terminate(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/pid", String(child.pid), "/T", "/F"],
        {
          stdio: "ignore",
          windowsHide: true,
        },
      );
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // no-op
  }
}

async function fetchText(url) {
  const response = await fetch(url);
  const body = await response.text();
  return { status: response.status, body };
}

function buildPollingUrl(baseUrl) {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
}

async function waitFor(condition, description) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < timeoutMs) {
    try {
      const ok = await condition();
      if (ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(400);
  }

  throw new Error(
    `${description} timed out after ${Math.round(timeoutMs / 1000)}s${
      lastError ? ` (lastError: ${lastError})` : ""
    }`,
  );
}

function printTail(label) {
  const tail = logs[label].slice(-20);
  if (tail.length === 0) {
    console.error(`\n[${label}] no output captured`);
    return;
  }

  console.error(`\n[${label}] tail output:`);
  for (const line of tail) {
    console.error(line);
  }
}

async function run() {
  console.log("🔎 smoke:vite-server-url start");
  console.log(`- server: http://${HOST}:${SERVER_PORT}`);
  console.log(`- client: http://${HOST}:${CLIENT_PORT}`);
  console.log(`- VITE_SERVER_URL: ${viteServerUrl || "(unset)"}`);

  await assertPortFree(SERVER_PORT, "Server");
  await assertPortFree(CLIENT_PORT, "Client");

  const server = spawnNpm(["run", "dev", "-w", "server"], "server", {
    PORT: String(SERVER_PORT),
    HOST,
  });

  const client = spawnNpm(
    [
      "run",
      "dev",
      "-w",
      "client",
      "--",
      "--host",
      HOST,
      "--port",
      String(CLIENT_PORT),
      "--strictPort",
    ],
    "client",
    {
      VITE_SERVER_URL: viteServerUrl,
    },
  );

  try {
    await waitFor(async () => {
      const { status } = await fetchText(
        `http://${HOST}:${SERVER_PORT}/api/health`,
      );
      return status === 200;
    }, "server /api/health");

    await waitFor(async () => {
      const { status } = await fetchText(`http://${HOST}:${CLIENT_PORT}/`);
      return status === 200;
    }, "client /");

    await waitFor(async () => {
      const { status } = await fetchText(
        `http://${HOST}:${CLIENT_PORT}/api/health`,
      );
      return status === 200;
    }, "vite proxy /api/health");

    await waitFor(async () => {
      const { status, body } = await fetchText(
        buildPollingUrl(`http://${HOST}:${CLIENT_PORT}`),
      );
      return status === 200 && body.includes('"sid"');
    }, "vite proxy /socket.io polling");

    if (viteServerUrl) {
      await waitFor(async () => {
        const { status, body } = await fetchText(
          buildPollingUrl(viteServerUrl),
        );
        return status === 200 && body.includes('"sid"');
      }, "direct VITE_SERVER_URL /socket.io polling");
    }

    console.log("✅ smoke:vite-server-url passed");
  } finally {
    await terminate(client);
    await terminate(server);
    await wait(600);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ smoke:vite-server-url failed: ${message}`);
  printTail("server");
  printTail("client");
  process.exitCode = 1;
});
