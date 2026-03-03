import assert from "node:assert/strict";
import test from "node:test";

import { buildBootstrapStatePayload } from "../../src/socket/handlers.ts";

test("buildBootstrapStatePayload maps fulfilled results", () => {
  const sessions = [
    {
      id: "session-1",
      model: "gpt-5.3",
      createdAt: 1,
      lastUsed: 2,
      title: "New Chat",
      mode: "interactive" as const,
    },
  ];

  const payload = buildBootstrapStatePayload(
    sessions,
    {
      status: "fulfilled",
      value: ["gpt-5.3", "gpt-4.1"],
    },
    {
      status: "fulfilled",
      value: {
        tools: ["web_search", "read_file"],
      },
    },
    {
      status: "fulfilled",
      value: {
        quotaSnapshots: {
          chat: {
            used: 10,
            limit: 100,
          },
        },
      },
    },
  );

  assert.deepEqual(payload, {
    sessions,
    models: ["gpt-5.3", "gpt-4.1"],
    tools: ["web_search", "read_file"],
    quota: {
      chat: {
        used: 10,
        limit: 100,
      },
    },
  });
});

test("buildBootstrapStatePayload falls back to empty structures", () => {
  const sessions = [
    {
      id: "session-2",
      model: "gpt-4.1",
      createdAt: 3,
      lastUsed: 4,
      title: "Fallback",
      mode: "plan" as const,
    },
  ];

  const payload = buildBootstrapStatePayload(
    sessions,
    {
      status: "rejected",
      reason: new Error("models failed"),
    },
    {
      status: "fulfilled",
      value: undefined,
    },
    {
      status: "rejected",
      reason: new Error("quota failed"),
    },
  );

  assert.deepEqual(payload, {
    sessions,
    models: [],
    tools: [],
    quota: {},
  });
});
