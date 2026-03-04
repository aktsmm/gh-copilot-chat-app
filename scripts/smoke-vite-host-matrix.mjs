import { spawn } from "node:child_process";

const defaultHosts = ["localhost", "127.0.0.1"];

function parseHosts(argv) {
  const fromArgs = argv
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (fromArgs.length > 0) {
    return [...new Set(fromArgs)];
  }

  const envRaw =
    typeof process.env.SMOKE_HOST_MATRIX === "string"
      ? process.env.SMOKE_HOST_MATRIX
      : "";
  const fromEnv = envRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (fromEnv.length > 0) {
    return [...new Set(fromEnv)];
  }

  return defaultHosts;
}

function runSmokeForHost(host) {
  return new Promise((resolve) => {
    console.log(`\n🧪 smoke:vite-server-url host=${host}`);
    const child = spawn(process.execPath, ["scripts/smoke-vite-server-url.mjs"], {
      stdio: "inherit",
      env: {
        ...process.env,
        SMOKE_HOST: host,
      },
    });

    child.on("exit", (code) => {
      resolve(typeof code === "number" ? code : 1);
    });

    child.on("error", (error) => {
      console.error(`[smoke-matrix] failed to start host=${host}:`, error);
      resolve(1);
    });
  });
}

async function run() {
  const hosts = parseHosts(process.argv.slice(2));
  console.log(`🔎 smoke:vite-host-matrix hosts=${hosts.join(", ")}`);

  let hasFailure = false;
  for (const host of hosts) {
    const exitCode = await runSmokeForHost(host);
    if (exitCode !== 0) {
      hasFailure = true;
      console.error(`❌ host=${host} failed (exit=${exitCode})`);
      continue;
    }
    console.log(`✅ host=${host} passed`);
  }

  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  console.log("✅ smoke:vite-host-matrix passed");
}

await run();
