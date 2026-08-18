/**
 * Copilot CLI release sync automation.
 *
 * Design contract (see .github/workflows/cli-release-auto-pr.yml):
 *  - Output is a pure function of (checked-out base branch content, upstream release list).
 *    No wall-clock timestamps, no run id and no random values are written to tracked files,
 *    so re-running against an unchanged base and an unchanged upstream produces
 *    byte-identical files.
 *  - Every release published after the tag recorded in the state file is replayed in
 *    ascending order, so intermediate releases are never lost when the sync pull request is
 *    still open and its branch gets regenerated from the base branch.
 *  - The workflow uses a single fixed sync branch, so this script decides early - before any
 *    dependency install - whether the latest tag is already proposed, on hold or rejected.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const DEFAULT_RELEASE_REPO = "github/copilot-cli";
const DEFAULT_SYNC_BRANCH = "automation/cli-release-sync";
const DEFAULT_MAX_REPLAY_RELEASES = 300;
const REPLAY_TAG_LIST_LIMIT = 50;
const PR_BODY_MARKER_PREFIX = "<!-- cli-release-sync: tag=";

const releaseRepo = process.env.CLI_RELEASE_REPO?.trim() || DEFAULT_RELEASE_REPO;
const forceUpdate = parseBoolean(process.env.CLI_RELEASE_FORCE);
const selfRepo = process.env.GITHUB_REPOSITORY?.trim() || "";
const holdLabel =
  process.env.CLI_RELEASE_HOLD_LABEL?.trim() || "automation:hold";
const maxReplayReleases = parsePositiveInt(
  process.env.CLI_RELEASE_MAX_REPLAY,
  DEFAULT_MAX_REPLAY_RELEASES,
);
const skipPullRequestCheck = parseBoolean(process.env.CLI_RELEASE_SKIP_PR_CHECK);

const stateDirPath = path.join(rootDir, ".github", "automation");
const legacyStateFilePath = path.join(stateDirPath, "cli-release-state.json");
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function uniqueLower(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value).trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
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

// ── Source file constants ────────────────────────────────────────────────────

function buildArrayConstantMatcher(constantName, suffix) {
  return new RegExp(
    `(const ${escapeRegExp(constantName)} = \\[)([\\s\\S]*?)(\\]\\s*${escapeRegExp(suffix)})`,
  );
}

function buildStringConstantMatcher(constantName, suffix) {
  return new RegExp(
    `(const ${escapeRegExp(constantName)} = ")(.*?)("${escapeRegExp(suffix)})`,
  );
}

function readModelArrayConstant(filePath, constantName, suffix) {
  const source = fs.readFileSync(filePath, "utf8");
  const matched = source.match(buildArrayConstantMatcher(constantName, suffix));
  if (!matched) {
    throw new Error(`${constantName} not found in ${filePath}`);
  }
  return parseStringArray(matched[2]);
}

/**
 * Replaces the whole array literal with `nextModels`.
 *
 * The previous implementation merged detected models into whatever happened to be on the
 * branch, which made the result depend on run history. Full replacement keeps the result a
 * function of (base branch content, replayed releases) only.
 */
function writeModelArrayConstant(filePath, constantName, suffix, nextModels) {
  const source = fs.readFileSync(filePath, "utf8");
  const matcher = buildArrayConstantMatcher(constantName, suffix);
  const matched = source.match(matcher);
  if (!matched) {
    throw new Error(`${constantName} not found in ${filePath}`);
  }

  const currentModels = parseStringArray(matched[2]);
  if (nextModels.length === 0 || equalsIgnoreCase(currentModels, nextModels)) {
    return { changed: false, currentModels, nextModels: currentModels };
  }

  const nextBlock = `${matched[1]}\n${nextModels.map((model) => `  "${model}",`).join("\n")}\n${matched[3]}`;
  return {
    changed: writeIfChanged(filePath, source.replace(matcher, nextBlock)),
    currentModels,
    nextModels,
  };
}

function readStringConstant(filePath, constantName, suffix) {
  const source = fs.readFileSync(filePath, "utf8");
  const matched = source.match(buildStringConstantMatcher(constantName, suffix));
  return matched ? matched[2] : undefined;
}

function writeStringConstant(filePath, constantName, suffix, nextValue) {
  const source = fs.readFileSync(filePath, "utf8");
  const matcher = buildStringConstantMatcher(constantName, suffix);
  const matched = source.match(matcher);
  if (!matched) {
    throw new Error(`${constantName} not found in ${filePath}`);
  }
  if (!nextValue || matched[2] === nextValue) {
    return { changed: false, currentValue: matched[2], nextValue: matched[2] };
  }

  return {
    changed: writeIfChanged(
      filePath,
      source.replace(matcher, `${matched[1]}${nextValue}${matched[3]}`),
    ),
    currentValue: matched[2],
    nextValue,
  };
}

/**
 * The default model is pinned by the repository, never by release notes.
 * It only moves when the pinned model disappears from the fallback list.
 */
function readPinnedDefaultModel(filePath) {
  const source = fs.readFileSync(filePath, "utf8");

  if (source.includes("const FALLBACK_MODELS = [")) {
    const models = readModelArrayConstant(filePath, "FALLBACK_MODELS", ";");
    return { strategy: "fallback-array", model: models[0] };
  }

  if (source.includes('const DEFAULT_MODEL_ID = "')) {
    return {
      strategy: "default-model-id",
      model: readStringConstant(filePath, "DEFAULT_MODEL_ID", ";"),
    };
  }

  throw new Error(
    `No supported useChat model constant found in ${filePath}; expected FALLBACK_MODELS or DEFAULT_MODEL_ID.`,
  );
}

function writeUseChatModels(filePath, strategy, models, defaultModel) {
  if (strategy === "fallback-array") {
    return writeModelArrayConstant(filePath, "FALLBACK_MODELS", ";", models);
  }
  return writeStringConstant(filePath, "DEFAULT_MODEL_ID", ";", defaultModel);
}

// ── Release note parsing ─────────────────────────────────────────────────────

const MODEL_ID_PATTERNS = [
  /\bgpt-\d+(?:\.\d+)?(?:-[a-z0-9]+)*\b/gi,
  /\bclaude-(?:sonnet|opus|haiku)-\d+(?:\.\d+)?(?:-[a-z0-9]+)*\b/gi,
  /\bgemini-\d+(?:\.\d+)?(?:-[a-z0-9]+)*\b/gi,
  /\bgrok-\d+(?:\.\d+)?(?:-[a-z0-9]+)*\b/gi,
  /\bo[34](?:-mini|-preview|-pro)?\b/gi,
];

/**
 * Release notes usually spell models as display names ("Claude Opus 5").
 * Only unambiguous families are normalised; anything else is reported but never applied.
 */
const DISPLAY_NAME_RULES = [
  {
    pattern: /\bclaude\s+(sonnet|opus|haiku)\s+(\d+(?:\.\d+)?)\b/gi,
    build: (match) => `claude-${match[1].toLowerCase()}-${match[2]}`,
  },
  {
    pattern: /\bgemini\s+(\d+(?:\.\d+)?)\s+(pro|flash)\b/gi,
    build: (match) => `gemini-${match[1]}-${match[2].toLowerCase()}`,
  },
  {
    pattern: /\bgrok\s+(\d+(?:\.\d+)?)\b/gi,
    build: (match) => `grok-${match[1]}`,
  },
  {
    pattern: /\bgpt-?\s?(\d+(?:\.\d+)?)[\s-](codex|mini|sol|terra|luna)\b/gi,
    build: (match) => `gpt-${match[1]}-${match[2].toLowerCase()}`,
  },
];

const REMOVE_SIGNALS = [
  /\bremov(?:e|es|ed|ing|al)\b/i,
  /\bdeprecat(?:e|es|ed|ing|ion)\b/i,
  /\bretir(?:e|es|ed|ing|ement)\b/i,
  /\bsunset(?:s|ted|ting)?\b/i,
  /\bdrop(?:s|ped|ping)?\s+support\b/i,
  /\bno\s+longer\s+(?:available|supported|offered|accessible)\b/i,
  /\bend\s+of\s+life\b/i,
  /\bEOL\b/,
];

const ADD_SIGNALS = [
  /\badd(?:s|ed|ing)?\s+support\s+for\b/i,
  /\bsupport\s+for\b/i,
  /\bnew\s+model\b/i,
  /\badd(?:s|ed|ing)?\s+(?:the\s+)?[^.]*\bmodels?\b/i,
  /\bnow\s+available\b/i,
  /\bis\s+now\s+supported\b/i,
  /\bintroduc(?:e|es|ed|ing)\b/i,
  /\bgenerally\s+available\b/i,
];

function matchesAny(line, patterns) {
  return patterns.some((pattern) => pattern.test(line));
}

function extractModelTokens(line) {
  const tokens = [];

  for (const pattern of MODEL_ID_PATTERNS) {
    for (const match of line.matchAll(pattern)) {
      tokens.push(match[0]);
    }
  }

  for (const rule of DISPLAY_NAME_RULES) {
    for (const match of line.matchAll(rule.pattern)) {
      tokens.push(rule.build(match));
    }
  }

  return uniqueLower(tokens);
}

/**
 * Returns "add" / "remove" / "none" for heading lines, or undefined when the line is not a
 * heading (in which case the current section is kept).
 */
function parseSectionKind(rawLine) {
  const line = rawLine.trim();
  const isHeading = /^#{1,6}\s+\S/.test(line) || /^\*\*[^*]+\*\*:?$/.test(line);
  if (!isHeading) return undefined;

  const label = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*/, "")
    .replace(/\*\*:?$/, "")
    .replace(/[:\s]+$/, "")
    .trim()
    .toLowerCase();

  if (/^(added|additions|new|new models|models added)$/.test(label)) {
    return "add";
  }
  if (
    /^(removed|removals|deprecated|deprecations|retired|retirements|models removed)$/.test(
      label,
    )
  ) {
    return "remove";
  }
  return "none";
}

/**
 * Classifies model mentions into add / remove / mention-only.
 *
 * Removal signals win over add signals on the same line, so "removed support for X" can never
 * add X. Lines without an explicit signal and without an Added/Removed section are recorded as
 * mentions only and never mutate the model list.
 */
function extractModelChanges(text) {
  const added = [];
  const removed = [];
  const mentioned = [];
  let section = "none";

  for (const rawLine of text.split(/\r?\n/)) {
    const sectionKind = parseSectionKind(rawLine);
    if (sectionKind !== undefined) {
      section = sectionKind;
      continue;
    }

    const tokens = extractModelTokens(rawLine);
    if (tokens.length === 0) continue;

    let bucket;
    if (matchesAny(rawLine, REMOVE_SIGNALS)) {
      bucket = removed;
    } else if (matchesAny(rawLine, ADD_SIGNALS)) {
      bucket = added;
    } else if (section === "remove") {
      bucket = removed;
    } else if (section === "add") {
      bucket = added;
    } else {
      bucket = mentioned;
    }

    bucket.push(...tokens);
  }

  const addedUnique = uniqueLower(added);
  const removedUnique = uniqueLower(removed);

  return {
    added: addedUnique,
    removed: removedUnique,
    mentioned: uniqueLower(mentioned).filter(
      (model) => !addedUnique.includes(model) && !removedUnique.includes(model),
    ),
  };
}

function applyModelChanges(models, changes) {
  const next = [...models];
  for (const model of changes.added) {
    if (!next.includes(model)) next.push(model);
  }
  return next.filter((model) => !changes.removed.includes(model));
}

/**
 * Keeps the pinned default first and guarantees a non-empty fallback list.
 */
function resolveModelList(models, pinnedDefault) {
  const list = uniqueLower(models);
  const pinned = pinnedDefault?.trim().toLowerCase();

  if (pinned && list.includes(pinned)) {
    return {
      models: [pinned, ...list.filter((model) => model !== pinned)],
      defaultModel: pinned,
    };
  }

  if (list.length > 0) {
    return { models: list, defaultModel: list[0] };
  }

  return { models: pinned ? [pinned] : [], defaultModel: pinned };
}

// ── GitHub API ───────────────────────────────────────────────────────────────

function sanitizeForFileName(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function getStateFilePath(repo) {
  if (repo === DEFAULT_RELEASE_REPO) {
    return legacyStateFilePath;
  }
  return path.join(
    stateDirPath,
    `cli-release-state--${sanitizeForFileName(repo)}.json`,
  );
}

/**
 * One fixed branch per release source - never one per release tag, otherwise every upstream
 * release opens a brand new pull request and the previous ones are never closed.
 */
function getSyncBranch(repo) {
  if (repo === DEFAULT_RELEASE_REPO) {
    return DEFAULT_SYNC_BRANCH;
  }
  return `${DEFAULT_SYNC_BRANCH}--${sanitizeForFileName(repo)}`;
}

function toDatePrefix(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid release publish date: ${isoDate}`);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function toDateOnly(isoDate) {
  return typeof isoDate === "string" ? isoDate.slice(0, 10) : "";
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function getRateLimitRetryDelay(response, detail, attempt) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const resetAt = response.headers.get("x-ratelimit-reset");
  const normalizedDetail = detail.toLowerCase();
  const isRateLimited =
    remaining === "0" ||
    normalizedDetail.includes("rate limit exceeded") ||
    normalizedDetail.includes("secondary rate limit");

  if (!isRateLimited) {
    return undefined;
  }

  const fallbackDelayMs = Math.min(2000 * attempt, 10000);
  if (!resetAt) {
    return fallbackDelayMs;
  }

  const resetDelayMs = Number(resetAt) * 1000 - Date.now();
  if (!Number.isFinite(resetDelayMs)) {
    return fallbackDelayMs;
  }

  return Math.max(1000, Math.min(resetDelayMs, 10000));
}

async function fetchWithRetry(url, options, maxAttempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && attempt < maxAttempts) {
        const detail = await response.text();
        const retryDelayMs = isRetryableStatus(response.status)
          ? 1000 * attempt
          : response.status === 403
            ? getRateLimitRetryDelay(response, detail, attempt)
            : undefined;

        if (retryDelayMs !== undefined) {
          const retryReason =
            response.status === 403
              ? "rate limit"
              : `status ${response.status}`;
          const resetAt = response.headers.get("x-ratelimit-reset");
          console.warn(
            `Fetch attempt ${attempt}/${maxAttempts} hit ${retryReason}; retrying in ${retryDelayMs}ms. ${detail.slice(0, 200)}${resetAt ? ` (reset=${resetAt})` : ""}`,
          );
          await sleep(retryDelayMs);
          continue;
        }
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        throw error;
      }

      console.warn(
        `Fetch attempt ${attempt}/${maxAttempts} failed; retrying. ${formatErrorMessage(error)}`,
      );
      await sleep(1000 * attempt);
    }
  }

  throw lastError;
}

function buildHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "copilot-chat-gui-cli-release-automation",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function normalizeRelease(repo, payload) {
  const tag =
    typeof payload.tag_name === "string" ? payload.tag_name.trim() : "";
  return {
    tag,
    name: typeof payload.name === "string" ? payload.name.trim() || tag : tag,
    body: typeof payload.body === "string" ? payload.body : "",
    url:
      typeof payload.html_url === "string"
        ? payload.html_url
        : `https://github.com/${repo}/releases`,
    publishedAt:
      typeof payload.published_at === "string"
        ? payload.published_at
        : typeof payload.created_at === "string"
          ? payload.created_at
          : "",
  };
}

async function fetchLatestRelease(repo, token) {
  const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
  const response = await fetchWithRetry(apiUrl, {
    headers: buildHeaders(token),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to fetch latest release (${response.status}) from ${apiUrl}: ${detail.slice(0, 300)}`,
    );
  }

  const release = normalizeRelease(repo, await response.json());
  if (!release.tag) {
    throw new Error(`Latest release tag is empty for repo ${repo}`);
  }
  if (!release.publishedAt) {
    throw new Error(`Latest release publish date is empty for repo ${repo}`);
  }
  return release;
}

/**
 * Newest-first list of published (non-draft, non-prerelease) releases.
 * The list endpoint already returns bodies, so replaying N releases costs ceil(N/100) requests.
 */
async function fetchReleaseHistory(repo, token, maxCount) {
  const perPage = 100;
  const maxPages = Math.max(1, Math.ceil(maxCount / perPage));
  const releases = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const apiUrl = `https://api.github.com/repos/${repo}/releases?per_page=${perPage}&page=${page}`;
    const response = await fetchWithRetry(apiUrl, {
      headers: buildHeaders(token),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Failed to fetch release history (${response.status}) from ${apiUrl}: ${detail.slice(0, 300)}`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) break;

    for (const item of payload) {
      if (item.draft || item.prerelease) continue;
      const release = normalizeRelease(repo, item);
      if (release.tag && release.publishedAt) releases.push(release);
    }

    if (payload.length < perPage) break;
  }

  // Locale-independent comparison: localeCompare would depend on the runner locale and could
  // order same-second releases differently on CI and locally, breaking byte-level determinism.
  return releases
    .sort((left, right) => {
      if (left.publishedAt !== right.publishedAt) {
        return left.publishedAt < right.publishedAt ? 1 : -1;
      }
      if (left.tag === right.tag) return 0;
      return left.tag < right.tag ? 1 : -1;
    })
    .slice(0, maxCount);
}

function readSyncTagFromPullRequest(pullRequest) {
  const body = typeof pullRequest.body === "string" ? pullRequest.body : "";
  const marker = body.match(/<!--\s*cli-release-sync:\s*tag=([^\s>]+)\s*-->/);
  if (marker) return marker[1].trim();

  const title = typeof pullRequest.title === "string" ? pullRequest.title : "";
  const fromTitle = title.match(/release\s+(\S+)\s*$/i);
  return fromTitle ? fromTitle[1].trim() : undefined;
}

/**
 * With a fixed sync branch, an already-open (or explicitly rejected) pull request for the same
 * tag must short-circuit the run before npm ci / lint / typecheck, and before any file write.
 */
async function inspectSyncPullRequest({ repo, branch, token, latestTag }) {
  if (!repo || !token || skipPullRequestCheck) {
    return { skip: false, reason: "pr-check-skipped" };
  }

  const [owner] = repo.split("/");
  const head = encodeURIComponent(`${owner}:${branch}`);
  const apiUrl = `https://api.github.com/repos/${repo}/pulls?head=${head}&state=all&per_page=30&sort=created&direction=desc`;
  const response = await fetchWithRetry(apiUrl, {
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn(
      `Could not inspect existing sync pull requests (${response.status}): ${detail.slice(0, 200)}`,
    );
    return { skip: false, reason: "pr-check-failed" };
  }

  const pullRequests = await response.json();
  if (!Array.isArray(pullRequests)) {
    return { skip: false, reason: "pr-check-failed" };
  }

  const openPullRequest = pullRequests.find(
    (pullRequest) => pullRequest.state === "open",
  );
  if (openPullRequest) {
    const labels = (openPullRequest.labels ?? []).map((label) =>
      String(label?.name ?? "").toLowerCase(),
    );
    if (labels.includes(holdLabel.toLowerCase())) {
      return {
        skip: true,
        reason: `on-hold (#${openPullRequest.number} carries "${holdLabel}")`,
        number: openPullRequest.number,
      };
    }
    if (readSyncTagFromPullRequest(openPullRequest) === latestTag) {
      return {
        skip: true,
        reason: `already-proposed (#${openPullRequest.number})`,
        number: openPullRequest.number,
      };
    }
    return {
      skip: false,
      reason: `refresh-open-pr (#${openPullRequest.number})`,
      number: openPullRequest.number,
    };
  }

  const rejected = pullRequests.find(
    (pullRequest) =>
      pullRequest.state === "closed" &&
      !pullRequest.merged_at &&
      readSyncTagFromPullRequest(pullRequest) === latestTag,
  );
  if (rejected) {
    return {
      skip: true,
      reason: `rejected (#${rejected.number} was closed without merging)`,
      number: rejected.number,
    };
  }

  return { skip: false, reason: "no-open-pr" };
}

// ── Outputs and rendering ────────────────────────────────────────────────────

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

function bulletList(values, emptyLabel = "- (none)") {
  return values.length > 0 ? values.map((value) => `- ${value}`) : [emptyLabel];
}

function inlineList(values) {
  return values.length > 0
    ? values.map((value) => `\`${value}\``).join(", ")
    : "(none)";
}

function formatChangeSummary(changes) {
  const parts = [
    ...changes.added.map((model) => `+${model}`),
    ...changes.removed.map((model) => `-${model}`),
  ];
  return parts.length > 0 ? parts.join(", ") : "";
}

function buildReplayedTagList(timeline) {
  const tags = timeline.map((entry) => entry.release.tag);
  if (tags.length === 0) return "(none)";
  if (tags.length <= REPLAY_TAG_LIST_LIMIT) return tags.join(", ");
  const recent = tags.slice(-REPLAY_TAG_LIST_LIMIT);
  return `${recent.join(", ")} (and ${tags.length - REPLAY_TAG_LIST_LIMIT} older release(s))`;
}

function buildReportContent(context) {
  const { release, previousTag, timeline, truncated, aggregate } = context;
  const changedReleases = timeline.filter(
    (entry) =>
      entry.changes.added.length > 0 || entry.changes.removed.length > 0,
  );
  const noteLines = release.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);

  return [
    `# Copilot CLI Release Sync (${release.tag})`,
    "",
    "## Summary",
    `- Source repository: ${releaseRepo}`,
    `- Latest release: ${release.name} (${release.tag})`,
    `- URL: ${release.url}`,
    `- Published at: ${release.publishedAt}`,
    `- Previously synced tag: ${previousTag ?? "(none)"}`,
    `- Releases replayed: ${timeline.length}`,
    `- Replay truncated: ${truncated ? "yes" : "no"}`,
    "",
    "## Fallback Model List",
    `- Default model: ${context.defaultModel ?? "(none)"}`,
    ...bulletList(context.models),
    "",
    "## Model Changes Applied",
    "### Added",
    ...bulletList(aggregate.added),
    "### Removed",
    ...bulletList(aggregate.removed),
    "### Mentioned only (not applied)",
    ...bulletList(aggregate.mentioned),
    "",
    "## Releases With Model Changes",
    ...(changedReleases.length > 0
      ? [
          "| Tag | Published | Change |",
          "| --- | --- | --- |",
          ...changedReleases.map(
            (entry) =>
              `| [${entry.release.tag}](${entry.release.url}) | ${toDateOnly(entry.release.publishedAt)} | ${formatChangeSummary(entry.changes)} |`,
          ),
        ]
      : ["- (none)"]),
    "",
    "## Replayed Releases",
    `- ${buildReplayedTagList(timeline)}`,
    "",
    "## Latest Release Notes (Excerpt)",
    ...(noteLines.length > 0
      ? noteLines.map((line) => `- ${line}`)
      : ["- (empty)"]),
    "",
    "_Generated by scripts/cli-release-automation.mjs. The content is derived only from",
    "release metadata, so repeated runs against the same base branch and the same upstream",
    "release list produce byte-identical output._",
    "",
  ].join("\n");
}

function buildPullRequestBody(context) {
  const { release, previousTag, timeline, truncated, aggregate } = context;

  return [
    `${PR_BODY_MARKER_PREFIX}${release.tag} -->`,
    "",
    "## Summary",
    `- Source release repo: \`${releaseRepo}\``,
    `- Release: \`${release.name}\` (\`${release.tag}\`), published ${release.publishedAt}`,
    `- URL: ${release.url}`,
    `- Previously synced tag: \`${previousTag ?? "(none)"}\``,
    `- Releases replayed: ${timeline.length}${truncated ? " (truncated, see report)" : ""}`,
    "",
    "## Model List",
    `- Default model: \`${context.defaultModel ?? "(none)"}\``,
    `- Added: ${inlineList(aggregate.added)}`,
    `- Removed: ${inlineList(aggregate.removed)}`,
    `- Mentioned only (not applied): ${inlineList(aggregate.mentioned)}`,
    "",
    "## Changed Files",
    ...bulletList(context.changedFiles.map((file) => `\`${file}\``)),
    "",
    `Full report: \`${context.reportRelativePath}\``,
    "",
    "## How this pull request is maintained",
    "- It lives on a single fixed branch. When a newer upstream release appears the branch is",
    "  regenerated from the base branch and **all** intermediate releases are replayed, so no",
    "  release is lost while this pull request stays open.",
    "- When the tag has not changed the workflow exits before touching the branch, so the head",
    "  SHA is stable and reviews and checks stay valid.",
    `- Add the \`${holdLabel}\` label to stop the automation from refreshing it.`,
    "- Closing it without merging suppresses re-creation for the same tag.",
    "",
    "Generated by `.github/workflows/cli-release-auto-pr.yml`.",
    "",
  ].join("\n");
}

function formatErrorMessage(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const parts = [error.message];
  if (error.cause) {
    parts.push(
      `cause: ${error.cause instanceof Error ? error.cause.message : String(error.cause)}`,
    );
  }
  return parts.join(" | ");
}

function toRepoRelative(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function finishWithoutUpdate({ release, syncBranch, previousTag, reason }) {
  writeOutput("has_update", "false");
  writeOutput("files_changed", "false");
  writeOutput("skip_reason", reason);
  writeOutput("models_detected", "");
  console.log(
    `No sync required (${reason}). latest=${release.tag} previous=${previousTag ?? "(none)"}`,
  );
  writeStepSummary([
    "## CLI release automation",
    "",
    `- Result: no update (${reason})`,
    `- Source repository: ${releaseRepo}`,
    `- Latest release: ${release.tag}`,
    `- Previously synced tag: ${previousTag ?? "(none)"}`,
    `- Sync branch: \`${syncBranch}\``,
  ]);
}

async function main() {
  const stateFilePath = getStateFilePath(releaseRepo);
  const syncBranch = getSyncBranch(releaseRepo);
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    process.env.CLI_RELEASE_TOKEN?.trim();

  const release = await fetchLatestRelease(releaseRepo, token);
  const state = readJson(stateFilePath) ?? {};
  const previousTag =
    typeof state.lastTag === "string" ? state.lastTag.trim() : undefined;

  writeOutput("release_tag", release.tag);
  writeOutput("release_name", release.name);
  writeOutput("release_url", release.url);
  writeOutput("release_published_at", release.publishedAt);
  writeOutput("previous_tag", previousTag ?? "");
  writeOutput("sync_branch", syncBranch);

  if (!forceUpdate && previousTag === release.tag) {
    finishWithoutUpdate({
      release,
      syncBranch,
      previousTag,
      reason: "tag-unchanged",
    });
    return;
  }

  // Runs before dependency install and before any file write, so an already-proposed tag
  // costs a single API call instead of a full npm ci / lint / typecheck cycle.
  const pullRequestState = await inspectSyncPullRequest({
    repo: selfRepo,
    branch: syncBranch,
    token,
    latestTag: release.tag,
  });
  if (pullRequestState.skip && !forceUpdate) {
    finishWithoutUpdate({
      release,
      syncBranch,
      previousTag,
      reason: pullRequestState.reason,
    });
    return;
  }

  const history = await fetchReleaseHistory(
    releaseRepo,
    token,
    maxReplayReleases,
  );
  const previousIndex = previousTag
    ? history.findIndex((entry) => entry.tag === previousTag)
    : -1;
  const truncated = Boolean(previousTag) && previousIndex < 0;
  const replayWindow = (
    previousIndex >= 0 ? history.slice(0, previousIndex) : history
  )
    .slice()
    .reverse();

  if (replayWindow.length === 0) {
    replayWindow.push(release);
  }

  const pinned = readPinnedDefaultModel(useChatFilePath);
  const baseModels = uniqueLower(
    readModelArrayConstant(storeFilePath, "DEFAULT_MODELS", "as const;"),
  );

  let workingModels = baseModels;
  const timeline = [];
  const aggregate = { added: [], removed: [], mentioned: [] };

  for (const entry of replayWindow) {
    const changes = extractModelChanges(`${entry.name}\n${entry.body}`);
    workingModels = applyModelChanges(workingModels, changes);
    timeline.push({ release: entry, changes });
    aggregate.added.push(...changes.added);
    aggregate.removed.push(...changes.removed);
    aggregate.mentioned.push(...changes.mentioned);
  }

  // Report the net effect, not every intermediate flip-flop.
  aggregate.added = uniqueLower(aggregate.added).filter(
    (model) => workingModels.includes(model) && !baseModels.includes(model),
  );
  aggregate.removed = uniqueLower(aggregate.removed).filter(
    (model) => baseModels.includes(model) && !workingModels.includes(model),
  );
  aggregate.mentioned = uniqueLower(aggregate.mentioned).filter(
    (model) => !workingModels.includes(model),
  );

  const { models: resolvedModels, defaultModel } = resolveModelList(
    workingModels,
    pinned.model,
  );

  const storeResult = writeModelArrayConstant(
    storeFilePath,
    "DEFAULT_MODELS",
    "as const;",
    resolvedModels,
  );
  const useChatResult = writeUseChatModels(
    useChatFilePath,
    pinned.strategy,
    resolvedModels,
    defaultModel,
  );

  // Named after the release publish date, never the run date, so the file name is stable
  // across reruns and across UTC midnight.
  const reportPath = path.join(
    reportsDirPath,
    `${toDatePrefix(release.publishedAt)}-cli-release-${sanitizeForFileName(release.tag)}.md`,
  );
  const reportRelativePath = toRepoRelative(reportPath);
  const renderContext = {
    release,
    previousTag,
    timeline,
    truncated,
    aggregate,
    models: resolvedModels,
    defaultModel,
    reportRelativePath,
    changedFiles: [],
  };
  const reportChanged = writeIfChanged(
    reportPath,
    buildReportContent(renderContext),
  );

  // Deliberately free of run timestamps: the state file must stay byte-stable across reruns.
  const nextState = {
    repo: releaseRepo,
    lastTag: release.tag,
    lastName: release.name,
    lastUrl: release.url,
    lastPublishedAt: release.publishedAt,
    lastModels: resolvedModels,
  };
  const stateChanged = writeIfChanged(
    stateFilePath,
    `${JSON.stringify(nextState, null, 2)}\n`,
  );

  const changedFiles = [];
  if (storeResult.changed) changedFiles.push(toRepoRelative(storeFilePath));
  if (useChatResult.changed) changedFiles.push(toRepoRelative(useChatFilePath));
  if (reportChanged) changedFiles.push(reportRelativePath);
  if (stateChanged) changedFiles.push(toRepoRelative(stateFilePath));
  renderContext.changedFiles = changedFiles;

  const prBodyPath = path.join(
    process.env.RUNNER_TEMP?.trim() || os.tmpdir(),
    "cli-release-pr-body.md",
  );
  fs.writeFileSync(prBodyPath, buildPullRequestBody(renderContext), "utf8");

  writeOutput("has_update", "true");
  writeOutput("skip_reason", "");
  writeOutput("files_changed", changedFiles.length > 0 ? "true" : "false");
  writeOutput("changed_files", changedFiles.join(","));
  writeOutput("models_detected", aggregate.added.join(","));
  writeOutput("models_removed", aggregate.removed.join(","));
  writeOutput("replayed_count", String(timeline.length));
  writeOutput("report_path", reportRelativePath);
  writeOutput("pr_body_path", prBodyPath);

  console.log(`Synced release: ${release.tag} (replayed ${timeline.length})`);
  console.log(`Models added: ${aggregate.added.join(", ") || "(none)"}`);
  console.log(`Models removed: ${aggregate.removed.join(", ") || "(none)"}`);
  console.log(`Changed files: ${changedFiles.join(", ") || "(none)"}`);

  writeStepSummary([
    "## CLI release automation",
    "",
    `- Latest release: ${release.tag} (${release.url})`,
    `- Previously synced tag: ${previousTag ?? "(none)"}`,
    `- Releases replayed: ${timeline.length}${truncated ? " (truncated)" : ""}`,
    `- Sync branch: \`${syncBranch}\``,
    `- Models added: ${aggregate.added.join(", ") || "(none)"}`,
    `- Models removed: ${aggregate.removed.join(", ") || "(none)"}`,
    `- Files changed: ${changedFiles.join(", ") || "(none)"}`,
  ]);
}

main().catch((error) => {
  console.error(`cli-release-automation failed: ${formatErrorMessage(error)}`);
  process.exitCode = 1;
});
