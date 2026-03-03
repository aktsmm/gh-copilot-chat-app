import assert from "node:assert/strict";
import test from "node:test";

import { parseAllowedPermissionKinds } from "../../src/config.ts";

test("parseAllowedPermissionKinds returns defaults when env is empty", () => {
  assert.deepEqual(parseAllowedPermissionKinds(undefined), [
    "read",
    "url",
    "mcp",
  ]);
  assert.deepEqual(parseAllowedPermissionKinds("  "), ["read", "url", "mcp"]);
});

test("parseAllowedPermissionKinds normalizes and deduplicates valid kinds", () => {
  assert.deepEqual(parseAllowedPermissionKinds(" read , URL ,mcp,read "), [
    "read",
    "url",
    "mcp",
  ]);
});

test("parseAllowedPermissionKinds rejects invalid kinds", () => {
  assert.throws(
    () => parseAllowedPermissionKinds("read,invalid-kind,url"),
    /invalid kinds/i,
  );
});
