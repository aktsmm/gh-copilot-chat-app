import assert from "node:assert/strict";
import test from "node:test";

import { parseWebSearchFallbackAllowedUrls } from "../../src/config.ts";

test("parseWebSearchFallbackAllowedUrls normalizes and de-duplicates valid hosts", () => {
  const parsed = parseWebSearchFallbackAllowedUrls(
    " Example.com ,example.com,news.example.com,LOCALHOST ",
  );

  assert.deepEqual(parsed, ["example.com", "news.example.com", "localhost"]);
});

test("parseWebSearchFallbackAllowedUrls rejects invalid entries", () => {
  assert.throws(
    () =>
      parseWebSearchFallbackAllowedUrls(
        "https://example.com,*.example.com,example.com/news",
      ),
    /invalid host entries/i,
  );
});

test("parseWebSearchFallbackAllowedUrls allows empty input", () => {
  assert.deepEqual(parseWebSearchFallbackAllowedUrls(undefined), []);
  assert.deepEqual(parseWebSearchFallbackAllowedUrls("  "), []);
});
