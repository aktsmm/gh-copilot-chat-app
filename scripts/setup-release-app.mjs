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
 * This script never sees your credentials, and the private key it receives is written to the
 * repository secret and then removed from memory - it is never stored on disk or committed.
 *
 * Usage:
 *   node scripts/setup-release-app.mjs
 */
import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const CALLBACK_PORT = Number(process.env.RELEASE_APP_PORT ?? 8765);
const CALLBACK_PATH = "/callback";
const VARIABLE_NAME = "CLI_RELEASE_APP_ID";
const SECRET_NAME = "CLI_RELEASE_APP_PRIVATE_KEY";

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

function buildManifest(repo) {
  const [owner, name] = repo.split("/");
  return {
    // The name must be unique across GitHub, hence the suffix.
    name: `cli-release-sync-${name}-${crypto.randomBytes(2).toString("hex")}`.slice(0, 34),
    url: `https://github.com/${owner}/${name}`,
    description:
      "Creates the Copilot CLI release sync pull request so its checks run without a manual workflow approval.",
    public: false,
    redirect_url: `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`,
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

function waitForCode(manifest, state) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, `http://localhost:${CALLBACK_PORT}`);

      if (url.pathname === CALLBACK_PATH) {
        const code = url.searchParams.get("code");
        const returnedState = url.searchParams.get("state");
        const ok = Boolean(code) && returnedState === state;

        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          page(
            ok
              ? "<h2>App created.</h2><p>You can close this tab and return to the terminal.</p>"
              : "<h2>Unexpected callback.</h2><p>Setup was aborted; nothing was changed.</p>",
          ),
        );

        server.close();
        if (ok) resolve(code);
        else reject(new Error("callback did not carry a valid code/state pair"));
        return;
      }

      // Auto-submits the manifest so the permission set cannot be edited by hand.
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        page(
          `<h3>Opening GitHub...</h3>
<form id="f" action="https://github.com/settings/apps/new?state=${state}" method="post">
  <input type="hidden" name="manifest" id="manifest">
  <noscript><button type="submit">Continue</button></noscript>
</form>
<script>
document.getElementById("manifest").value = ${JSON.stringify(JSON.stringify(manifest))};
document.getElementById("f").submit();
</script>`,
        ),
      );
    });

    server.on("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1");

    setTimeout(
      () => {
        server.close();
        reject(new Error("timed out waiting for GitHub to redirect back"));
      },
      15 * 60 * 1000,
    ).unref();
  });
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

async function main() {
  requireGh();
  const repo = resolveRepo();
  const state = crypto.randomBytes(16).toString("hex");
  const manifest = buildManifest(repo);
  const startUrl = `http://localhost:${CALLBACK_PORT}/`;

  console.log(`Repository: ${repo}`);
  console.log("Requested permissions:", JSON.stringify(manifest.default_permissions));
  console.log("");
  console.log("A browser tab will open on GitHub. Sign in if asked, then press");
  console.log('"Create GitHub App". Everything after that is automatic.');
  console.log("");

  const pending = waitForCode(manifest, state);
  if (!openInBrowser(startUrl)) {
    console.log(`Could not open a browser. Visit this URL manually: ${startUrl}`);
  } else {
    console.log(`If no tab opened, visit: ${startUrl}`);
  }

  const app = await convert(await pending);
  console.log(`\nCreated app "${app.slug}" (id ${app.id}).`);

  // The private key is piped straight into the secret; it is never written to disk.
  execFileSync("gh", ["secret", "set", SECRET_NAME, "--repo", repo, "--body", app.pem], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  execFileSync(
    "gh",
    ["variable", "set", VARIABLE_NAME, "--repo", repo, "--body", String(app.id)],
    { stdio: ["ignore", "inherit", "inherit"] },
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
  console.error(`\nSetup failed: ${error.message}`);
  process.exitCode = 1;
});
