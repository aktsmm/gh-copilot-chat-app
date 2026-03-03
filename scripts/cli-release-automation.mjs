import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const defaultReleaseRepo =
  process.env.CLI_RELEASE_REPO?.trim() || "github/copilot-cli";
const forceUpdate = parseBoolean(process.env.CLI_RELEASE_FORCE);

const stateFilePath = path.join(
  rootDir,
  ".github",
  "automation",
  "cli-release-state.json",
);
const storeFilePath = path.join(rootDir, "client", "src", "lib", "store.ts");
const useChatFilePath = path.join(
  rootDir,
  "client",
  "src",
  "lib",
  "useChat.ts",
);
const reportsDirPath = path.join(rootDir, "reports");

function parseBoolean(value) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return undefined;
  return JSON.parse(raw);
}

function writeIfChanged(filePath, nextContent) {
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : undefined;
  if (current === nextContent) {
    return false;
  }
  ensureDir(filePath);
  fs.writeFileSync(filePath, nextContent, "utf8");
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStringArray(block) {
  return [...block.matchAll(/"([^"\r\n]+)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function mergeModels(preferred, existing) {
  const merged = [];
  const seen = new Set();

  for (const candidate of [...preferred, ...existing]) {
    const normalized = candidate.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

function equalsIgnoreCase(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].toLowerCase() !== right[index].toLowerCase()) {
      return false;
    }
  }
  return true;
}

function updateModelArrayConstant(
  filePath,
  constantName,
  suffix,
  preferredModels,
) {
  const source = fs.readFileSync(filePath, "utf8");
  const matcher = new RegExp(
    `(const ${escapeRegExp(constantName)} = \\[)([\\s\\S]*?)(\\]\\s*${escapeRegExp(suffix)})`,
  );
  const matched = source.match(matcher);

  if (!matched) {
    throw new Error(`${constantName} not found in ${filePath}`);
  }

  const currentModels = parseStringArray(matched[2]);
  const hasPreferredModels = preferredModels.length > 0;
  const nextModels = hasPreferredModels
    ? mergeModels(preferredModels, currentModels)
    : currentModels;

  if (!hasPreferredModels || equalsIgnoreCase(currentModels, nextModels)) {
    return {
      changed: false,
      currentModels,
      nextModels: currentModels,
    };
  }

  const nextBlock = `${matched[1]}\n${nextModels.map((model) => `  "${model}",`).join("\n")}\n${matched[3]}`;
  const updated = source.replace(matcher, nextBlock);
  const changed = writeIfChanged(filePath, updated);

  return {
    changed,
    currentModels,
    nextModels,
  };
}

function extractModelIds(text) {
  const patterns = [
    /\b(gpt-\d(?:\.\d+)?(?:-[a-z0-9.]+)*)\b/gi,
    /\b(o\d(?:-[a-z0-9.]+)*)\b/gi,
    /\b(claude-(?:sonnet|opus|haiku)-\d(?:\.\d+)?(?:-[a-z0-9.]+)*)\b/gi,
  ];
  const models = [];
  const seen = new Set();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = (match[1] ?? "").trim().toLowerCase();
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      models.push(candidate);
    }
  }

  return models;
}

function sanitizeForFileName(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function toDatePrefix(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

async function fetchLatestRelease(repo, token) {
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "copilot-chat-gui-cli-release-automation",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to fetch latest release (${response.status}) from ${apiUrl}: ${detail.slice(0, 300)}`,
    );
  }

  const payload = await response.json();
  const tag =
    typeof payload.tag_name === "string" ? payload.tag_name.trim() : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : tag;
  const body = typeof payload.body === "string" ? payload.body : "";
  const url =
    typeof payload.html_url === "string"
      ? payload.html_url
      : `https://github.com/${repo}/releases`;
  const publishedAt =
    typeof payload.published_at === "string"
      ? payload.published_at
      : new Date().toISOString();

  if (!tag) {
    throw new Error(`Latest release tag is empty for repo ${repo}`);
  }

  return {
    tag,
    name,
    body,
    url,
    publishedAt,
  };
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const serialized = String(value ?? "");
  const delimiter = `EOF_${name}_${Date.now()}`;
  fs.appendFileSync(
    outputPath,
    `${name}<<${delimiter}\n${serialized}\n${delimiter}\n`,
    "utf8",
  );
}

function writeStepSummary(lines) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${lines.join("\n")}\n`, "utf8");
}

function buildReportContent(release, detectedModels, appliedModels) {
  const noteLines = release.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);

  return [
    `# Copilot CLI Release Auto Update (${release.tag})`,
    "",
    "## Summary",
    `- Repository: ${defaultReleaseRepo}`,
    `- Release: ${release.name} (${release.tag})`,
    `- URL: ${release.url}`,
    `- Published at: ${release.publishedAt}`,
    "",
    "## Detected Model IDs",
    ...(detectedModels.length > 0
      ? detectedModels.map((model) => `- ${model}`)
      : ["- (none)"]),
    "",
    "## Applied Default Models",
    ...appliedModels.map((model) => `- ${model}`),
    "",
    "## Release Notes (Excerpt)",
    ...(noteLines.length > 0
      ? noteLines.map((line) => `- ${line}`)
      : ["- (empty)"]),
    "",
    "_This file is generated by scripts/cli-release-automation.mjs._",
    "",
  ].join("\n");
}

async function main() {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.CLI_RELEASE_TOKEN?.trim();

  const release = await fetchLatestRelease(defaultReleaseRepo, token);
  const state = readJson(stateFilePath) ?? {};
  const previousTag =
    typeof state.lastTag === "string" ? state.lastTag.trim() : undefined;
  const hasUpdate = forceUpdate || previousTag !== release.tag;

  writeOutput("has_update", hasUpdate ? "true" : "false");
  writeOutput("release_tag", release.tag);
  writeOutput("release_name", release.name);
  writeOutput("release_url", release.url);
  writeOutput("release_tag_slug", sanitizeForFileName(release.tag));

  if (!hasUpdate) {
    console.log(
      `No new release. latest=${release.tag} previous=${previousTag ?? "(none)"}`,
    );
    writeOutput("files_changed", "false");
    writeOutput("models_detected", "");
    writeStepSummary([
      "## CLI release automation",
      "",
      `- No update detected (${release.tag})`,
      `- Repository: ${defaultReleaseRepo}`,
    ]);
    return;
  }

  const detectedModels = extractModelIds(`${release.name}\n${release.body}`);
  const storeResult = updateModelArrayConstant(
    storeFilePath,
    "DEFAULT_MODELS",
    "as const;",
    detectedModels,
  );
  const useChatResult = updateModelArrayConstant(
    useChatFilePath,
    "FALLBACK_MODELS",
    ";",
    storeResult.nextModels,
  );

  const reportFileName = `${toDatePrefix(new Date())}-cli-release-${sanitizeForFileName(release.tag)}.md`;
  const reportPath = path.join(reportsDirPath, reportFileName);
  const reportContent = buildReportContent(
    release,
    detectedModels,
    storeResult.nextModels,
  );
  const reportChanged = writeIfChanged(reportPath, reportContent);

  const nextState = {
    repo: defaultReleaseRepo,
    lastTag: release.tag,
    lastName: release.name,
    lastUrl: release.url,
    lastPublishedAt: release.publishedAt,
    lastDetectedAt: new Date().toISOString(),
    lastModels: storeResult.nextModels,
  };
  const stateChanged = writeIfChanged(
    stateFilePath,
    `${JSON.stringify(nextState, null, 2)}\n`,
  );

  const changedFiles = [];
  if (storeResult.changed)
    changedFiles.push(path.relative(rootDir, storeFilePath));
  if (useChatResult.changed)
    changedFiles.push(path.relative(rootDir, useChatFilePath));
  if (reportChanged) changedFiles.push(path.relative(rootDir, reportPath));
  if (stateChanged) changedFiles.push(path.relative(rootDir, stateFilePath));

  writeOutput("files_changed", changedFiles.length > 0 ? "true" : "false");
  writeOutput("models_detected", detectedModels.join(","));
  writeOutput("changed_files", changedFiles.join(","));

  console.log(`Applied release update: ${release.tag}`);
  console.log(`Detected models: ${detectedModels.join(", ") || "(none)"}`);
  console.log(`Changed files: ${changedFiles.join(", ") || "(none)"}`);

  writeStepSummary([
    "## CLI release automation",
    "",
    `- Updated release: ${release.tag}`,
    `- URL: ${release.url}`,
    `- Models detected: ${detectedModels.join(", ") || "(none)"}`,
    `- Files changed: ${changedFiles.join(", ") || "(none)"}`,
  ]);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`cli-release-automation failed: ${message}`);
  process.exitCode = 1;
});
