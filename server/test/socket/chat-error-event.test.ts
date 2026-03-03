import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAckErrorPayload,
  buildChatErrorPayload,
  emitChatError,
  getChatErrorMetricsSnapshot,
  resetChatErrorMetricsForTest,
  resolveSessionErrorMessage,
} from "../../src/socket/handlers.ts";

test("buildChatErrorPayload classifies error code when omitted", () => {
  const payload = buildChatErrorPayload("session-1", "Session not found");

  assert.deepEqual(payload, {
    sessionId: "session-1",
    error: "Session not found",
    errorCode: "SESSION_NOT_FOUND",
  });
});

test("buildChatErrorPayload keeps explicit error code", () => {
  const payload = buildChatErrorPayload(
    "session-2",
    "custom failure",
    "SEND_FAILED",
  );

  assert.deepEqual(payload, {
    sessionId: "session-2",
    error: "custom failure",
    errorCode: "SEND_FAILED",
  });
});

test("emitChatError emits chat:error with normalized payload", () => {
  resetChatErrorMetricsForTest();
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    emit(event: string, payload: unknown) {
      emitted.push({ event, payload });
      return true;
    },
  };

  emitChatError(socket, undefined, "   ");

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.event, "chat:error");
  assert.deepEqual(emitted[0]?.payload, {
    sessionId: null,
    error: "Unknown error",
    errorCode: "UNKNOWN",
  });
});

test("emitChatError updates error code metrics", () => {
  resetChatErrorMetricsForTest();
  const socket = {
    emit() {
      return true;
    },
  };

  emitChatError(socket, "session-1", "Session not found");
  emitChatError(socket, "session-2", "Session not found");
  emitChatError(socket, "session-3", "Failed to send message");

  const metrics = getChatErrorMetricsSnapshot();
  assert.equal(metrics.SESSION_NOT_FOUND, 2);
  assert.equal(metrics.SEND_FAILED, 1);
});

test("buildAckErrorPayload keeps explicit error code", () => {
  const payload = buildAckErrorPayload(
    "Session not found",
    "SESSION_NOT_FOUND",
  );

  assert.deepEqual(payload, {
    ok: false,
    error: "Session not found",
    errorCode: "SESSION_NOT_FOUND",
  });
});

test("buildAckErrorPayload classifies and normalizes error", () => {
  const payload = buildAckErrorPayload("   ");

  assert.deepEqual(payload, {
    ok: false,
    error: "Unknown error",
    errorCode: "UNKNOWN",
  });
});

test("resolveSessionErrorMessage prefers top-level message", () => {
  const message = resolveSessionErrorMessage({
    message: "  top-level session failure  ",
    error: { message: "nested" },
  });

  assert.equal(message, "top-level session failure");
});

test("resolveSessionErrorMessage falls back to nested error.message", () => {
  const message = resolveSessionErrorMessage({
    error: { message: "nested session failure" },
  });

  assert.equal(message, "nested session failure");
});
