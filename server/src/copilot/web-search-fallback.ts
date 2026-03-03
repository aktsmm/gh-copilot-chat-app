import { execFile } from "node:child_process";

/** Strip all ANSI escape sequences (colours, cursor moves, etc.) */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\))/g, "");
}

function normalizeToolName(tool: unknown): string {
  if (typeof tool === "string") return tool;
  if (!tool || typeof tool !== "object") return "";
  const record = tool as Record<string, unknown>;
  const namespaced =
    typeof record.namespacedName === "string" ? record.namespacedName : "";
  const name = typeof record.name === "string" ? record.name : "";
  return namespaced || name;
}

const WEB_SEARCH_AVAILABLE_TOOLS = [
  "web_search",
  "brave_web_search",
  "bing_web_search",
  "bing_search",
  "mcp_brave-search_brave_web_search",
  "mcp_brave-search_brave_news_search",
  "mcp_brave-search_brave_local_search",
] as const;
const WEB_SEARCH_TOOL_KEYS = new Set<string>(WEB_SEARCH_AVAILABLE_TOOLS);
const WEB_SEARCH_TOOL_ALIAS_MAP = new Map<string, string>([
  ["mcp_brave-search.brave_web_search", "mcp_brave-search_brave_web_search"],
  [
    "mcp_brave-search.brave_news_search",
    "mcp_brave-search_brave_news_search",
  ],
  [
    "mcp_brave-search.brave_local_search",
    "mcp_brave-search_brave_local_search",
  ],
]);
const WEB_SEARCH_TOOL_EQUIVALENCE_GROUPS = [
  ["brave_web_search", "mcp_brave-search_brave_web_search"],
  ["mcp_brave-search.brave_web_search", "mcp_brave-search_brave_web_search"],
  ["mcp_brave-search.brave_news_search", "mcp_brave-search_brave_news_search"],
  [
    "mcp_brave-search.brave_local_search",
    "mcp_brave-search_brave_local_search",
  ],
] as const;
const WEB_SEARCH_DEFAULT_ALLOWED_URLS = [
  "weather.gov",
  "www.jma.go.jp",
  "tenki.jp",
  "www.bbc.com",
  "www.reuters.com",
  "apnews.com",
  "www.nhk.or.jp",
  "www.nikkei.com",
] as const;
const WEATHER_PROMPT_PATTERN = /(天気|気温|降水|weather|forecast)/i;
const KNOWN_LOCATION_PATTERN =
  /(東京|大阪|名古屋|札幌|福岡|京都|神戸|横浜|北海道|沖縄|tokyo|osaka|kyoto|yokohama|sapporo|fukuoka|japan|usa|uk|taipei|hong\s?kong|singapore)/i;
const JA_LOCATION_SUFFIX_PATTERN =
  /(?:^|[\s、。])[^\s、。]{1,20}(?:都|道|府|県|市|区|町|村)(?:\s|$|[、。!?！？])/;
const EN_LOCATION_HINT_PATTERN =
  /\b(in|at|for|near)\s+[A-Za-z][A-Za-z\s-]{1,40}\b/i;

function hasLocationHint(prompt: string): boolean {
  return (
    KNOWN_LOCATION_PATTERN.test(prompt) ||
    JA_LOCATION_SUFFIX_PATTERN.test(prompt) ||
    EN_LOCATION_HINT_PATTERN.test(prompt)
  );
}

function isLikelyJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(text);
}

function normalizeLocaleInput(locale: string | undefined): string {
  if (!locale) return "";
  return locale.trim().replace(/_/g, "-").toLowerCase();
}

function inferDefaultWeatherLocationFromLocale(
  localeInput: string | undefined,
): string | undefined {
  const locale = normalizeLocaleInput(localeInput);
  if (!locale) return undefined;

  if (locale.startsWith("ja")) return "Tokyo, Japan";
  if (locale.startsWith("ko")) return "Seoul, South Korea";
  if (locale.startsWith("zh-tw")) return "Taipei, Taiwan";
  if (locale.startsWith("zh-hk")) return "Hong Kong";
  if (locale.startsWith("zh")) return "Shanghai, China";
  if (locale.startsWith("en-gb") || locale.startsWith("en-ie")) {
    return "London, UK";
  }
  if (
    locale.startsWith("en-us") ||
    locale.startsWith("es-us") ||
    locale.startsWith("en-ca") ||
    locale.startsWith("fr-ca")
  ) {
    return "New York, US";
  }
  if (
    locale.startsWith("fr") ||
    locale.startsWith("de") ||
    locale.startsWith("it")
  ) {
    return "Paris, France";
  }
  if (locale.startsWith("en-au") || locale.startsWith("en-nz")) {
    return "Sydney, Australia";
  }
  if (
    locale.startsWith("en-sg") ||
    locale.startsWith("ms") ||
    locale.startsWith("id")
  ) {
    return "Singapore";
  }

  return undefined;
}

function inferDefaultWeatherLocationFromTimeZone(timeZoneInput?: string): string {
  const timeZone =
    timeZoneInput ??
    process.env.TZ ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "";

  if (/Asia\/Tokyo/i.test(timeZone)) return "Tokyo, Japan";
  if (/Asia\/(Seoul|Pyongyang)/i.test(timeZone)) return "Seoul, South Korea";
  if (/Asia\/Taipei/i.test(timeZone)) return "Taipei, Taiwan";
  if (/Asia\/Hong_Kong/i.test(timeZone)) return "Hong Kong";
  if (/Asia\/Shanghai/i.test(timeZone)) return "Shanghai, China";
  if (/Asia\/(Singapore|Kuala_Lumpur|Jakarta|Bangkok|Manila)/i.test(timeZone)) {
    return "Singapore";
  }
  if (/Europe\/(London|Dublin)/i.test(timeZone)) return "London, UK";
  if (/Europe\//i.test(timeZone)) return "Paris, France";
  if (/America\/(New_York|Detroit|Toronto|Montreal)/i.test(timeZone)) {
    return "New York, US";
  }
  if (/America\/(Chicago|Winnipeg|Mexico_City)/i.test(timeZone)) {
    return "Chicago, US";
  }
  if (/America\/(Denver|Edmonton)/i.test(timeZone)) return "Denver, US";
  if (/America\/(Los_Angeles|Vancouver|Tijuana)/i.test(timeZone)) {
    return "Los Angeles, US";
  }
  if (/Australia\/(Sydney|Melbourne|Brisbane)/i.test(timeZone)) {
    return "Sydney, Australia";
  }

  return "Tokyo, Japan";
}

export function inferDefaultWeatherLocation(input?: {
  preferredLocation?: string;
  preferredLocale?: string;
  locale?: string;
  timeZone?: string;
}): string;
export function inferDefaultWeatherLocation(timeZoneInput?: string): string;
export function inferDefaultWeatherLocation(
  input?:
    | string
    | {
        preferredLocation?: string;
        preferredLocale?: string;
        locale?: string;
        timeZone?: string;
      },
): string {
  if (typeof input === "string") {
    return inferDefaultWeatherLocationFromTimeZone(input);
  }

  const preferredLocation = input?.preferredLocation?.trim();
  if (preferredLocation) return preferredLocation;

  const preferredByLocale = inferDefaultWeatherLocationFromLocale(
    input?.preferredLocale,
  );
  if (preferredByLocale) return preferredByLocale;

  const runtimeByLocale = inferDefaultWeatherLocationFromLocale(input?.locale);
  if (runtimeByLocale) return runtimeByLocale;

  return inferDefaultWeatherLocationFromTimeZone(input?.timeZone);
}

export function hasWebSearchTool(tools: unknown[]): boolean {
  return tools.some((tool) => Boolean(toWebSearchToolKey(tool)));
}

function toWebSearchToolKey(tool: unknown): string | undefined {
  const normalizedName = normalizeToolName(tool).trim().toLowerCase();
  if (!normalizedName) return undefined;

  if (WEB_SEARCH_TOOL_KEYS.has(normalizedName)) {
    return normalizedName;
  }

  return WEB_SEARCH_TOOL_ALIAS_MAP.get(normalizedName);
}

function isEquivalentWebSearchToolKey(a: string, b: string): boolean {
  if (a === b) return true;

  for (const group of WEB_SEARCH_TOOL_EQUIVALENCE_GROUPS) {
    const normalizedGroup = group as readonly string[];
    if (normalizedGroup.includes(a) && normalizedGroup.includes(b)) {
      return true;
    }
  }

  return false;
}

function collectWebSearchToolKeys(tools: unknown[]): Set<string> {
  const keys = new Set<string>();
  for (const tool of tools) {
    const key = toWebSearchToolKey(tool);
    if (key) keys.add(key);
  }
  return keys;
}

function isWebSearchToolExcluded(
  toolKey: string,
  excludedToolKeys: Set<string>,
): boolean {
  for (const excludedKey of excludedToolKeys) {
    if (isEquivalentWebSearchToolKey(toolKey, excludedKey)) {
      return true;
    }
  }
  return false;
}

export function isWebSearchToolAvailable(options: {
  availableTools?: unknown[];
  excludedTools?: unknown[];
  modelTools?: unknown[];
}): boolean {
  const excludedToolKeys = collectWebSearchToolKeys(options.excludedTools ?? []);

  if (Array.isArray(options.availableTools) && options.availableTools.length > 0) {
    const availableWebSearchToolKeys = collectWebSearchToolKeys(
      options.availableTools,
    );
    if (availableWebSearchToolKeys.size === 0) return false;

    for (const toolKey of availableWebSearchToolKeys) {
      if (!isWebSearchToolExcluded(toolKey, excludedToolKeys)) {
        return true;
      }
    }

    return false;
  }

  const modelWebSearchToolKeys = collectWebSearchToolKeys(options.modelTools ?? []);
  if (modelWebSearchToolKeys.size === 0) return false;

  for (const toolKey of modelWebSearchToolKeys) {
    if (!isWebSearchToolExcluded(toolKey, excludedToolKeys)) {
      return true;
    }
  }

  return false;
}

export function isLikelyWebSearchPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  if (/\b(web\s*search|search\s+the\s+web|search online)\b/i.test(prompt)) {
    return true;
  }

  return /(web検索|検索して|調べて|ニュース|天気|株価|最新情報|latest news|weather|forecast|stock)/i.test(
    prompt,
  );
}

function normalizeAllowedUrls(urls: readonly string[] | undefined): string[] {
  if (!urls) return [];
  const normalized = urls
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return [...new Set(normalized)];
}

export function buildWebSearchUrlPermissionArgs(options?: {
  allowAllUrls?: boolean;
  allowedUrls?: readonly string[];
}): string[] {
  if (options?.allowAllUrls) {
    return ["--allow-all-urls"];
  }

  const allowedUrls = normalizeAllowedUrls(options?.allowedUrls);
  const effectiveUrls =
    allowedUrls.length > 0 ? allowedUrls : [...WEB_SEARCH_DEFAULT_ALLOWED_URLS];

  return ["--allow-url", ...effectiveUrls];
}

function buildWebSearchPrompt(
  userPrompt: string,
  locationHints?: {
    preferredLocation?: string;
    preferredLocale?: string;
    locale?: string;
    timeZone?: string;
  },
): string {
  const weatherPrompt = WEATHER_PROMPT_PATTERN.test(userPrompt);
  const hasPromptLocationHint = hasLocationHint(userPrompt);
  const japanesePrompt = isLikelyJapanese(userPrompt);
  const defaultLocation = inferDefaultWeatherLocation(locationHints);
  const weatherGuidanceJa =
    weatherPrompt && !hasPromptLocationHint
      ? [
          `- 天気系の質問で地域指定がない場合は、暫定で「${defaultLocation}」の明日の予報を検索して具体値（天気・最高/最低気温・降水確率）を提示する`,
          "- 回答末尾で、地域を指定すると精度を上げられる旨を1行で案内する",
        ]
      : [];

  const weatherGuidanceEn =
    weatherPrompt && !hasPromptLocationHint
      ? [
          `- If the weather question does not specify a place, search tomorrow's forecast for "${defaultLocation}" and provide concrete values (condition, high/low temperature, precipitation chance).`,
          "- Add one short note at the end saying that specifying the location will improve accuracy.",
        ]
      : [];

  if (japanesePrompt) {
    return [
      "あなたは Web 検索アシスタントです。",
      "必ず web_search / brave_web_search 等の検索ツールを実行し、",
      "取得した検索結果をもとに回答してください。",
      "検索ツールを使わずにリンクだけ羅列するのは禁止です。",
      "",
      "## 回答ルール",
      "- 検索結果から分かった事実を箇条書きでまとめる",
      "- 出典 URL を各情報に付ける",
      "- 不明な点は不明と明記する",
      "- プレーンテキストで返す（Markdown 装飾は最小限に）",
      "- 回答言語はユーザーの質問言語に合わせる",
      ...weatherGuidanceJa,
      "",
      "## ユーザーの質問",
      userPrompt,
    ].join("\n");
  }

  return [
    "You are a web search assistant.",
    "You must execute a web search tool such as web_search or brave_web_search.",
    "Base your answer on retrieved search results.",
    "Do not answer by listing generic sites without running a search tool.",
    "",
    "## Response rules",
    "- Summarize facts found in search results as bullet points",
    "- Attach source URLs to each key fact",
    "- Clearly state when information is unknown",
    "- Return plain text with minimal Markdown",
    "- Match the response language to the user's prompt language",
    ...weatherGuidanceEn,
    "",
    "## User question",
    userPrompt,
  ].join("\n");
}

export function buildWebSearchFallbackArgs(options: {
  prompt: string;
  model: string;
  allowAllUrls?: boolean;
  allowedUrls?: readonly string[];
  preferredLocation?: string;
  preferredLocale?: string;
  locale?: string;
  timeZone?: string;
}): string[] {
  const cliPrompt = buildWebSearchPrompt(options.prompt, {
    preferredLocation: options.preferredLocation,
    preferredLocale: options.preferredLocale,
    locale: options.locale,
    timeZone: options.timeZone,
  });
  const urlPermissionArgs = buildWebSearchUrlPermissionArgs({
    allowAllUrls: options.allowAllUrls,
    allowedUrls: options.allowedUrls,
  });

  return [
    "-p",
    cliPrompt,
    "--model",
    options.model,
    "--allow-all-tools",
    "--available-tools",
    ...WEB_SEARCH_AVAILABLE_TOOLS,
    "--deny-tool",
    "shell",
    "--deny-tool",
    "write",
    ...urlPermissionArgs,
    "--no-ask-user",
    "--no-color",
    "--stream",
    "off",
    "--silent",
  ];
}

export function sanitizeWebSearchFallbackOutput(
  stdout: string | null | undefined,
  stderr: string | null | undefined,
): string {
  const sanitizedStdout = stripAnsi((stdout ?? "").trim());
  if (sanitizedStdout) {
    return sanitizedStdout;
  }

  const sanitizedStderr = stripAnsi((stderr ?? "").trim());
  if (sanitizedStderr) {
    throw new Error("Web search fallback returned no assistant output");
  }

  if (!sanitizedStdout) {
    throw new Error("Web search fallback returned empty output");
  }

  return sanitizedStdout;
}

function buildWebSearchFallbackExecError(error: unknown): Error {
  if (error && typeof error === "object") {
    const maybeErr = error as {
      code?: string | number;
      signal?: string;
      message?: string;
    };
    const details = [
      maybeErr.code !== undefined ? `code=${String(maybeErr.code)}` : null,
      maybeErr.signal ? `signal=${maybeErr.signal}` : null,
    ].filter((entry): entry is string => Boolean(entry));

    if (details.length > 0) {
      return new Error(`Web search fallback failed (${details.join(", ")})`);
    }

    if (typeof maybeErr.message === "string" && maybeErr.message.trim()) {
      return new Error("Web search fallback failed");
    }
  }

  return new Error("Web search fallback failed");
}

export async function runWebSearchFallback(options: {
  cliPath: string;
  prompt: string;
  model: string;
  timeoutMs: number;
  allowAllUrls?: boolean;
  allowedUrls?: readonly string[];
  preferredLocation?: string;
  preferredLocale?: string;
  locale?: string;
  timeZone?: string;
}): Promise<string> {
  const {
    cliPath,
    prompt,
    model,
    timeoutMs,
    allowAllUrls,
    allowedUrls,
    preferredLocation,
    preferredLocale,
    locale,
    timeZone,
  } = options;
  const args = buildWebSearchFallbackArgs({
    prompt,
    model,
    allowAllUrls,
    allowedUrls,
    preferredLocation,
    preferredLocale,
    locale,
    timeZone,
  });

  return await new Promise<string>((resolve, reject) => {
    execFile(
      cliPath,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(buildWebSearchFallbackExecError(error));
          return;
        }

        try {
          resolve(sanitizeWebSearchFallbackOutput(stdout, stderr));
        } catch (outputError: unknown) {
          reject(outputError);
        }
      },
    );
  });
}
