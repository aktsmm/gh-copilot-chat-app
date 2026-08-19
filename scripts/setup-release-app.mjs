/**
 * One-command setup for the GitHub App that creates the Copilot CLI release sync
 * pull request.
 *
 * Why an App is needed at all: a pull request created with `secrets.GITHUB_TOKEN` has its
 * `pull_request` workflow runs held in `action_required` until a human approves them, so the
 * required check never reports and auto-merge never completes. A pull request created with a
 * GitHub App installation token does not hit that gate.
 *
 * Why this script instead of the settings UI: it uses the GitHub App manifest flow, so the
 * permission set is declared as data (it cannot be mis-clicked) and GitHub returns the app id
 * together with a freshly generated private key over the API. Nothing has to be downloaded,
 * copied, or pasted by hand.
 *
 * What you still do yourself: sign in / re-authenticate on github.com and press one button.
 * This script never sees your credentials.
 *
 * Handling of the private key: it is passed to `gh` over stdin, never as a command-line
 * argument, because process arguments are readable by other processes and are captured
 * verbatim by process-creation auditing (Sysmon, auditd execve, EDR) - which would put the
 * key into log storage even though this script writes no files. The key is likewise kept out
 * of error output. It does still live in this process's heap until exit: JavaScript strings
 * are immutable, so it cannot be zeroed.
 *
 * Usage:
 *   node scripts/setup-release-app.mjs
 */
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const CALLBACK_PATH = "/callback";
const VARIABLE_NAME = "CLI_RELEASE_APP_ID";
const SECRET_NAME = "CLI_RELEASE_APP_PRIVATE_KEY";
const REQUESTED_PORT = Number(process.env.RELEASE_APP_PORT ?? 0);

function sh(command, args) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function resolveRepo() {
  if (process.env.RELEASE_APP_REPO) return process.env.RELEASE_APP_REPO.trim();
  try {
    return sh("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  } catch {
    throw new Error(
      "Could not determine the repository. Run this inside the repo, or set RELEASE_APP_REPO=owner/name.",
    );
  }
}

function requireGh() {
  try {
    sh("gh", ["auth", "status"]);
  } catch {
    throw new Error("GitHub CLI is not authenticated. Run `gh auth login` first.");
  }
}

function openInBrowser(url) {
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(command[0], command[1], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialises for embedding inside a <script> block. Escaping `<` keeps a value from closing
 * the script element, even though every field here is currently script-free.
 */
function embedJson(value) {
  return JSON.stringify(JSON.stringify(value)).replace(/</g, "\\u003c");
}

function buildManifest(repo, port) {
  const [owner, name] = repo.split("/");
  return {
    // The name must be unique across GitHub, hence the suffix.
    name: `cli-release-sync-${name}-${crypto.randomBytes(2).toString("hex")}`.slice(0, 34),
    url: `https://github.com/${owner}/${name}`,
    description:
      "Creates the Copilot CLI release sync pull request so its checks run without a manual workflow approval.",
    public: false,
    redirect_url: `http://localhost:${port}${CALLBACK_PATH}`,
    hook_attributes: { url: "https://example.invalid/unused", active: false },
    default_events: [],
    // Least privilege: exactly what .github/workflows/cli-release-auto-pr.yml uses.
    default_permissions: {
      contents: "write",
      pull_requests: "write",
      issues: "write",
      metadata: "read",
    },
  };
}

function page(body) {
  return `<!doctype html><meta charset="utf-8"><title>Release sync app setup</title><body style="font-family:system-ui;margin:3rem;max-width:40rem">${body}</body>`;
}

function respond(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    // The manifest page carries the state nonce; never let it sit in a cache.
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  response.end(page(body));
}

/**
 * Rejects any request whose Host header is not a literal loopback address.
 *
 * Binding to 127.0.0.1 alone does not stop DNS rebinding: an attacker page can point its own
 * hostname at 127.0.0.1 and then read this server same-origin, which would leak the state
 * nonce and let it feed us a `code` for an app it owns.
 */
function isLoopbackHost(hostHeader, port) {
  if (!hostHeader) return false;
  return (
    hostHeader === `localhost:${port}` ||
    hostHeader === `127.0.0.1:${port}` ||
    hostHeader === `[::1]:${port}`
  );
}

/**
 * Starts the callback server on an ephemeral port and returns it together with a promise
 * for the temporary code. The port has to be known before the manifest is built, because
 * the manifest carries the redirect URL.
 */
function startCallbackServer(state, getManifest) {
  let settle;
  const pending = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The caller only awaits this after the listen/browser steps, so mark it handled now;
  // otherwise a rejection in that window is reported as an unhandled rejection and kills
  // the process before the real error handling runs.
  pending.catch(() => {});

  const server = http.createServer((request, response) => {
    const port = server.address()?.port;
    if (!isLoopbackHost(request.headers.host, port)) {
      respond(response, 403, "<h2>Forbidden.</h2>");
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${port}`);

    if (url.pathname === CALLBACK_PATH) {
      const code = url.searchParams.get("code");
      const ok = Boolean(code) && url.searchParams.get("state") === state;

      respond(
        response,
        200,
        ok
          ? "<h2>App created.</h2><p>You can close this tab and return to the terminal.</p>"
          : "<h2>Unexpected callback.</h2><p>Setup was aborted; nothing was changed.</p>",
      );

      server.close();
      if (ok) settle.resolve(code);
      else settle.reject(new Error("callback did not carry a valid code/state pair"));
      return;
    }

    if (url.pathname !== "/") {
      respond(response, 404, "<h2>Not found.</h2>");
      return;
    }

    // Auto-submits the manifest so the permission set cannot be edited by hand.
    respond(
      response,
      200,
      `<h3>Opening GitHub...</h3>
<form id="f" action="https://github.com/settings/apps/new?state=${state}" method="post">
  <input type="hidden" name="manifest" id="manifest">
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>
document.getElementById("manifest").value = ${embedJson(getManifest())};
document.getElementById("f").submit();
</script>`,
    );
  });

  server.on("error", (error) => settle.reject(error));

  const listening = new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(REQUESTED_PORT, "127.0.0.1", () =>
      resolve(server.address().port),
    );
  });

  const timer = setTimeout(
    () => {
      server.close();
      settle.reject(new Error("timed out waiting for GitHub to redirect back"));
    },
    15 * 60 * 1000,
  );
  timer.unref();

  return { listening, pending, close: () => server.close() };
}

async function convert(code) {
  const response = await fetch(
    `https://api.github.com/app-manifests/${code}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "cli-release-app-setup",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Could not exchange the temporary code (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }

  return response.json();
}

/**
 * Runs `gh` with `input` on stdin.
 *
 * Two properties matter for the private key: the value never appears in argv, and a non-zero
 * exit is reported without Node's default message, which concatenates the arguments.
 */
function ghWithStdin(args, input, failureMessage) {
  try {
    execFileSync("gh", args, { input, stdio: ["pipe", "inherit", "inherit"] });
  } catch {
    throw new Error(failureMessage);
  }
}

function ghWithArgs(args, failureMessage) {
  try {
    execFileSync("gh", args, { stdio: ["ignore", "inherit", "inherit"] });
  } catch {
    throw new Error(failureMessage);
  }
}

async function main() {
  requireGh();
  const repo = resolveRepo();
  const state = crypto.randomBytes(16).toString("hex");

  let manifest;
  const server = startCallbackServer(state, () => manifest);
  const port = await server.listening;
  manifest = buildManifest(repo, port);
  const startUrl = `http://localhost:${port}/`;

  console.log(`Repository: ${repo}`);
  console.log("Requested permissions:", JSON.stringify(manifest.default_permissions));
  console.log("");
  console.log("A browser tab will open on GitHub. Sign in if asked, then press");
  console.log('"Create GitHub App". Everything after that is automatic.');
  console.log("");

  if (!openInBrowser(startUrl)) {
    console.log(`Could not open a browser. Visit this URL manually: ${startUrl}`);
  } else {
    console.log(`If no tab opened, visit: ${startUrl}`);
  }

  let app;
  try {
    app = await convert(await server.pending);
  } finally {
    server.close();
  }
  console.log(`\nCreated app "${app.slug}" (id ${app.id}).`);

  // stdin, not --body: an argument would expose the key to other processes and to
  // process-creation audit logs, and would be echoed back by a failed execFileSync.
  ghWithStdin(
    ["secret", "set", SECRET_NAME, "--repo", repo],
    app.pem,
    `Could not store ${SECRET_NAME} on ${repo}. The app was created; check that your gh token can write repository secrets, then set it manually.`,
  );
  ghWithArgs(
    ["variable", "set", VARIABLE_NAME, "--repo", repo, "--body", String(app.id)],
    `Could not store ${VARIABLE_NAME} on ${repo}. Set it manually to ${app.id}.`,
  );
  console.log(`Stored ${VARIABLE_NAME} and ${SECRET_NAME} on ${repo}.`);

  const installUrl = `${app.html_url}/installations/new`;
  console.log("\nLast step: install the app on this repository.");
  console.log(`  ${installUrl}`);
  openInBrowser(installUrl);
  console.log(
    "\nAfter installing, the release sync pull request will run its checks without a manual approval.",
  );
}

main().catch((error) => {
  // Only the message is printed, never a stack or a command line, so a failure around the
  // `gh` calls cannot put the private key on screen or into a piped log.
  console.error(`\nSetup failed: ${error.message}`);
  process.exitCode = 1;
});
