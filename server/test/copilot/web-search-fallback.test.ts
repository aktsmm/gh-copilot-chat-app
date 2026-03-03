import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWebSearchFallbackArgs,
  buildWebSearchUrlPermissionArgs,
  hasWebSearchTool,
  inferDefaultWeatherLocation,
  isWebSearchToolAvailable,
  isLikelyWebSearchPrompt,
  sanitizeWebSearchFallbackOutput,
} from "../../src/copilot/web-search-fallback.ts";

test("hasWebSearchTool detects web search tools from string and object", () => {
  assert.equal(hasWebSearchTool(["web_fetch", "web_search"]), true);
  assert.equal(
    hasWebSearchTool([
      { name: "fetch" },
      { name: "search", namespacedName: "mcp_brave-search_brave_web_search" },
    ]),
    true,
  );
  assert.equal(
    hasWebSearchTool([{ name: "web_fetch" }, { namespacedName: "task" }]),
    false,
  );
  assert.equal(hasWebSearchTool([{ name: "bingo_tool" }]), false);
  assert.equal(hasWebSearchTool(["mcp_brave-search_brave_news_search"]), true);
  assert.equal(hasWebSearchTool(["mcp_brave-search_brave_local_search"]), true);
  assert.equal(hasWebSearchTool(["my_web_search_helper"]), false);
});

test("isWebSearchToolAvailable respects allow/exclude policies", () => {
  assert.equal(
    isWebSearchToolAvailable({
      availableTools: ["read_file"],
      modelTools: ["web_search"],
    }),
    false,
  );
  assert.equal(
    isWebSearchToolAvailable({
      availableTools: ["mcp_brave-search_brave_web_search"],
      excludedTools: ["mcp_brave-search_brave_web_search"],
    }),
    false,
  );
  assert.equal(
    isWebSearchToolAvailable({
      modelTools: ["mcp_brave-search_brave_local_search", "read_file"],
      excludedTools: ["mcp_brave-search_brave_web_search"],
    }),
    true,
  );
  assert.equal(
    isWebSearchToolAvailable({
      availableTools: ["brave_web_search"],
      excludedTools: ["mcp_brave-search_brave_web_search"],
    }),
    false,
  );
  assert.equal(
    isWebSearchToolAvailable({
      availableTools: ["my_web_search_helper"],
      modelTools: ["read_file"],
    }),
    false,
  );
});

test("isLikelyWebSearchPrompt classifies search-intent prompts", () => {
  assert.equal(isLikelyWebSearchPrompt("Web検索で東京の天気を調べて"), true);
  assert.equal(isLikelyWebSearchPrompt("明日の天気は？"), true);
  assert.equal(
    isLikelyWebSearchPrompt("Search the web for Azure updates"),
    true,
  );
  assert.equal(
    isLikelyWebSearchPrompt("price formatter のバグを直して"),
    false,
  );
  assert.equal(isLikelyWebSearchPrompt("READMEのtypoだけ修正して"), false);
});

test("inferDefaultWeatherLocation infers location from timezone", () => {
  assert.equal(inferDefaultWeatherLocation("Asia/Tokyo"), "Tokyo, Japan");
  assert.equal(inferDefaultWeatherLocation("Asia/Taipei"), "Taipei, Taiwan");
  assert.equal(inferDefaultWeatherLocation("Asia/Hong_Kong"), "Hong Kong");
  assert.equal(inferDefaultWeatherLocation("Asia/Shanghai"), "Shanghai, China");
  assert.equal(
    inferDefaultWeatherLocation("America/Los_Angeles"),
    "Los Angeles, US",
  );
  assert.equal(inferDefaultWeatherLocation("Europe/Berlin"), "Paris, France");
  assert.equal(inferDefaultWeatherLocation("Unknown/Nowhere"), "Tokyo, Japan");

  assert.equal(
    inferDefaultWeatherLocation({
      preferredLocation: "Osaka, Japan",
      preferredLocale: "en-US",
      locale: "ja-JP",
      timeZone: "Asia/Tokyo",
    }),
    "Osaka, Japan",
  );
  assert.equal(
    inferDefaultWeatherLocation({
      locale: "en-GB",
      timeZone: "America/Los_Angeles",
    }),
    "London, UK",
  );
  assert.equal(
    inferDefaultWeatherLocation({
      locale: "",
      timeZone: "America/Los_Angeles",
    }),
    "Los Angeles, US",
  );
});

test("buildWebSearchFallbackArgs injects locale-prioritized weather default", () => {
  const args = buildWebSearchFallbackArgs({
    prompt: "What's the weather tomorrow?",
    model: "gpt-5-mini",
    preferredLocale: "en-US",
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
  });

  const promptArg = args[1] ?? "";
  assert.equal(promptArg.includes('"New York, US"'), true);
});

test("buildWebSearchFallbackArgs limits available tools and defaults to URL allowlist", () => {
  const args = buildWebSearchFallbackArgs({
    prompt: "明日の天気は？",
    model: "gpt-5-mini",
  });

  assert.equal(args.includes("--allow-all-tools"), true);
  assert.equal(args.includes("--available-tools"), true);
  assert.equal(args.includes("web_search"), true);
  assert.equal(args.includes("brave_web_search"), true);
  assert.equal(args.includes("--deny-tool"), true);
  assert.equal(args.includes("shell"), true);
  assert.equal(args.includes("write"), true);
  assert.equal(args.includes("--allow-url"), true);
  assert.equal(args.includes("--allow-all-urls"), false);
});

test("buildWebSearchFallbackArgs supports explicit allow-all URL policy", () => {
  const args = buildWebSearchFallbackArgs({
    prompt: "latest news",
    model: "gpt-5-mini",
    allowAllUrls: true,
    allowedUrls: ["example.com"],
  });

  assert.equal(args.includes("--allow-all-urls"), true);
  assert.equal(args.includes("--allow-url"), false);
});

test("buildWebSearchUrlPermissionArgs normalizes custom domain list", () => {
  const args = buildWebSearchUrlPermissionArgs({
    allowedUrls: [" example.com ", "example.com", "news.example.com"],
  });

  assert.deepEqual(args, ["--allow-url", "example.com", "news.example.com"]);
});

test("sanitizeWebSearchFallbackOutput strips ANSI and rejects empty output", () => {
  const sanitized = sanitizeWebSearchFallbackOutput(
    "\u001b[35m●\u001b[39m test",
    "",
  );
  assert.equal(sanitized.includes("\u001b[35m"), false);
  assert.equal(sanitized.includes("test"), true);

  assert.throws(() => sanitizeWebSearchFallbackOutput("", ""), /empty output/i);
  assert.throws(
    () => sanitizeWebSearchFallbackOutput("", "warning only"),
    /no assistant output/i,
  );
});
