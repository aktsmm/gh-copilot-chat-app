import assert from "node:assert/strict";
import test from "node:test";

import { selectWindowsCopilotCliCandidate } from "../../src/config.ts";

test("selectWindowsCopilotCliCandidate prefers exe outside node_modules/.bin", () => {
  const selected = selectWindowsCopilotCliCandidate([
    "C:\\repo\\node_modules\\.bin\\copilot.exe",
    "C:\\Program Files\\GitHub Copilot\\copilot.exe",
    "C:\\Windows\\System32\\copilot.cmd",
  ]);

  assert.equal(selected, "C:\\Program Files\\GitHub Copilot\\copilot.exe");
});

test("selectWindowsCopilotCliCandidate falls back to any exe", () => {
  const selected = selectWindowsCopilotCliCandidate([
    "C:\\repo\\node_modules\\.bin\\copilot.exe",
    "C:\\repo\\node_modules\\.bin\\copilot.cmd",
  ]);

  assert.equal(selected, "C:\\repo\\node_modules\\.bin\\copilot.exe");
});

test("selectWindowsCopilotCliCandidate falls back to non-node_modules command", () => {
  const selected = selectWindowsCopilotCliCandidate([
    "C:\\repo\\node_modules\\.bin\\copilot.cmd",
    "C:\\Users\\dev\\AppData\\Local\\GitHubCopilot\\copilot.cmd",
  ]);

  assert.equal(
    selected,
    "C:\\Users\\dev\\AppData\\Local\\GitHubCopilot\\copilot.cmd",
  );
});

test("selectWindowsCopilotCliCandidate handles forward-slash node_modules paths", () => {
  const selected = selectWindowsCopilotCliCandidate([
    "C:/repo/node_modules/.bin/copilot.exe",
    "C:/Program Files/GitHub Copilot/copilot.exe",
  ]);

  assert.equal(selected, "C:/Program Files/GitHub Copilot/copilot.exe");
});

test("selectWindowsCopilotCliCandidate prefers non-node_modules command over node_modules exe", () => {
  const selected = selectWindowsCopilotCliCandidate([
    "C:\\repo\\node_modules\\.bin\\copilot.exe",
    "C:\\Users\\dev\\AppData\\Local\\GitHubCopilot\\copilot.cmd",
  ]);

  assert.equal(
    selected,
    "C:\\Users\\dev\\AppData\\Local\\GitHubCopilot\\copilot.cmd",
  );
});

test("selectWindowsCopilotCliCandidate returns undefined when no candidates", () => {
  const selected = selectWindowsCopilotCliCandidate(["", "   "]);

  assert.equal(selected, undefined);
});
