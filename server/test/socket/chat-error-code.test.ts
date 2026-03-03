import assert from "node:assert/strict";
import test from "node:test";

import { classifyChatErrorCode } from "../../src/socket/handlers.ts";
import { CHAT_ERROR_CODES } from "../../../shared/chat-error-code.js";

test("classifyChatErrorCode maps known messages", () => {
  assert.equal(
    classifyChatErrorCode("Missing sessionId or prompt"),
    "INVALID_REQUEST",
  );
  assert.equal(classifyChatErrorCode("Invalid sessionId"), "INVALID_REQUEST");
  assert.equal(classifyChatErrorCode("Invalid model"), "INVALID_REQUEST");
  assert.equal(classifyChatErrorCode("Session not found"), "SESSION_NOT_FOUND");
  assert.equal(
    classifyChatErrorCode("Failed to switch mode"),
    "MODE_SWITCH_FAILED",
  );
  assert.equal(
    classifyChatErrorCode(
      "Research mode failed to start. Please use another model or disable Research mode.",
    ),
    "FLEET_START_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("Failed to start fleet mode"),
    "FLEET_START_FAILED",
  );
  assert.equal(
    classifyChatErrorCode(
      "Research mode is not available for the selected model.",
    ),
    "FLEET_UNAVAILABLE",
  );
  assert.equal(classifyChatErrorCode("Failed to send message"), "SEND_FAILED");
  assert.equal(
    classifyChatErrorCode("Failed to create session"),
    "CREATE_SESSION_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("Failed to load models"),
    "MODEL_LIST_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("Failed to load tools"),
    "TOOLS_LIST_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("Session error occurred"),
    "SESSION_ERROR",
  );
});

test("classifyChatErrorCode maps CLI and auth related messages", () => {
  assert.equal(
    classifyChatErrorCode("Copilot CLI not found in PATH"),
    "CLI_NOT_FOUND",
  );
  assert.equal(
    classifyChatErrorCode("spawn EINVAL while launching copilot"),
    "CLI_SPAWN_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("spawn ENOENT while launching copilot"),
    "CLI_SPAWN_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("spawn EACCES while launching copilot"),
    "CLI_SPAWN_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("spawn EPERM while launching copilot"),
    "CLI_SPAWN_FAILED",
  );
  assert.equal(
    classifyChatErrorCode("client not connected to copilot service"),
    "CLI_NOT_CONNECTED",
  );
  assert.equal(
    classifyChatErrorCode("Not authenticated: please login"),
    "AUTH_REQUIRED",
  );
});

test("classifyChatErrorCode returns UNKNOWN for unmatched messages", () => {
  assert.equal(classifyChatErrorCode("Some unexpected failure"), "UNKNOWN");
  assert.equal(classifyChatErrorCode(""), "UNKNOWN");
  assert.equal(
    classifyChatErrorCode("Authoring pipeline failed"),
    "UNKNOWN",
  );
});

test("classifyChatErrorCode always returns declared code", () => {
  const declaredCodes = new Set(CHAT_ERROR_CODES);
  const sampleMessages = [
    "Missing sessionId or prompt",
    "Session not found",
    "Failed to switch mode",
    "Research mode failed to start",
    "Research mode is not available",
    "Failed to send message",
    "Failed to create session",
    "Failed to load models",
    "Failed to load tools",
    "Session error occurred",
    "Copilot CLI not found",
    "spawn EINVAL",
    "client not connected",
    "Not authenticated",
    "totally unknown error",
    "",
  ];

  for (const message of sampleMessages) {
    const code = classifyChatErrorCode(message);
    assert.equal(declaredCodes.has(code), true);
  }
});
