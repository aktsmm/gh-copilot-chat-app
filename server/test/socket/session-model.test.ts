import assert from "node:assert/strict";
import test from "node:test";

import type { CopilotSession } from "@github/copilot-sdk";
import { handleSessionModelUpdate } from "../../src/socket/handlers.ts";

function createSocketCollector() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emitted,
    socket: {
      emit(event: string, payload: unknown) {
        emitted.push({ event, payload });
        return true;
      },
    },
  };
}

test("session:model returns invalid sessionId for blank input", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "   ", model: "gpt-4.1" },
    (payload) => {
      ackPayload = payload;
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Invalid sessionId",
    errorCode: "INVALID_REQUEST",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: null,
        error: "Invalid sessionId",
        errorCode: "INVALID_REQUEST",
      },
    },
  ]);
});

test("session:model returns invalid model for blank model", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "session-1", model: "   " },
    (payload) => {
      ackPayload = payload;
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Invalid model",
    errorCode: "INVALID_REQUEST",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-1",
        error: "Invalid model",
        errorCode: "INVALID_REQUEST",
      },
    },
  ]);
});

test("session:model returns not found when session is missing", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "session-2", model: "gpt-4.1" },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => undefined,
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Session not found",
    errorCode: "SESSION_NOT_FOUND",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-2",
        error: "Session not found",
        errorCode: "SESSION_NOT_FOUND",
      },
    },
  ]);
});

test("session:model returns not found when reconfigure returns null", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "session-3", model: "gpt-4.1" },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => ({
        session: {} as CopilotSession,
      }),
      reconfigureSession: async () => null,
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Session not found",
    errorCode: "SESSION_NOT_FOUND",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-3",
        error: "Session not found",
        errorCode: "SESSION_NOT_FOUND",
      },
    },
  ]);
});

test("session:model emits chat:model and rewires bindings on success", async () => {
  const { emitted, socket } = createSocketCollector();
  const nextSession = {} as CopilotSession;
  const rebindCalls: Array<{ sessionId: string; session: CopilotSession }> = [];
  let ackPayload: unknown;
  let capturedOptions:
    | {
        model: string;
        availableTools?: string[];
        excludedTools?: string[];
      }
    | undefined;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "session-4", model: "  gpt-4.1  " },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => ({
        session: {} as CopilotSession,
        availableTools: ["toolA"],
        excludedTools: ["toolB"],
      }),
      reconfigureSession: async (_sessionId, options) => {
        capturedOptions = options;
        return {
          model: "gpt-4.1",
          session: nextSession,
        };
      },
      rebindSessionEvents: (sessionId, session) => {
        rebindCalls.push({ sessionId, session });
      },
    },
  );

  assert.deepEqual(capturedOptions, {
    model: "gpt-4.1",
    availableTools: ["toolA"],
    excludedTools: ["toolB"],
  });
  assert.deepEqual(rebindCalls, [
    {
      sessionId: "session-4",
      session: nextSession,
    },
  ]);
  assert.deepEqual(emitted, [
    {
      event: "chat:model",
      payload: {
        sessionId: "session-4",
        model: "gpt-4.1",
      },
    },
  ]);
  assert.deepEqual(ackPayload, {
    ok: true,
    model: "gpt-4.1",
  });
});

test("session:model returns fallback error when reconfigure throws non-error", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionModelUpdate(
    socket,
    { sessionId: "session-5", model: "gpt-4.1" },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => ({
        session: {} as CopilotSession,
      }),
      reconfigureSession: async () => {
        throw "boom";
      },
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Failed to set model",
    errorCode: "UNKNOWN",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-5",
        error: "Failed to set model",
        errorCode: "UNKNOWN",
      },
    },
  ]);
});
