import assert from "node:assert/strict";
import test from "node:test";

import type { CopilotSession } from "@github/copilot-sdk";
import { handleSessionToolsUpdate } from "../../src/socket/handlers.ts";

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

test("session:tools returns invalid sessionId for blank input", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionToolsUpdate(socket, { sessionId: "   " }, (payload) => {
    ackPayload = payload;
  });

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

test("session:tools returns not found when session is missing", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionToolsUpdate(
    socket,
    { sessionId: "session-2", availableTools: ["toolA"] },
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

test("session:tools returns not found when reconfigure returns null", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionToolsUpdate(
    socket,
    { sessionId: "session-3", availableTools: ["toolA"] },
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

test("session:tools emits chat:tools_updated and rewires bindings on success", async () => {
  const { emitted, socket } = createSocketCollector();
  const nextSession = {} as CopilotSession;
  const rebindCalls: Array<{ sessionId: string; session: CopilotSession }> = [];
  let ackPayload: unknown;
  let capturedOptions:
    | {
        availableTools?: string[];
        excludedTools?: string[];
      }
    | undefined;

  await handleSessionToolsUpdate(
    socket,
    {
      sessionId: "session-4",
      availableTools: [" toolA ", "", "toolB"],
    },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => ({
        session: {} as CopilotSession,
      }),
      reconfigureSession: async (_sessionId, options) => {
        capturedOptions = options;
        return {
          session: nextSession,
          availableTools: ["toolA", "toolB"],
          excludedTools: undefined,
        };
      },
      rebindSessionEvents: (sessionId, session) => {
        rebindCalls.push({ sessionId, session });
      },
    },
  );

  assert.deepEqual(capturedOptions, {
    availableTools: ["toolA", "toolB"],
    excludedTools: undefined,
  });
  assert.deepEqual(rebindCalls, [
    {
      sessionId: "session-4",
      session: nextSession,
    },
  ]);
  assert.deepEqual(emitted, [
    {
      event: "chat:tools_updated",
      payload: {
        sessionId: "session-4",
        availableTools: ["toolA", "toolB"],
        excludedTools: undefined,
      },
    },
  ]);
  assert.deepEqual(ackPayload, {
    ok: true,
    availableTools: ["toolA", "toolB"],
    excludedTools: undefined,
  });
});

test("session:tools returns fallback error when reconfigure throws non-error", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionToolsUpdate(
    socket,
    {
      sessionId: "session-5",
      availableTools: ["toolA"],
    },
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
    error: "Failed to update tool policy",
    errorCode: "UNKNOWN",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-5",
        error: "Failed to update tool policy",
        errorCode: "UNKNOWN",
      },
    },
  ]);
});

test("session:tools rejects payloads with both availableTools and excludedTools", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionToolsUpdate(
    socket,
    {
      sessionId: "session-6",
      availableTools: ["toolA"],
      excludedTools: ["toolB"],
    },
    (payload) => {
      ackPayload = payload;
    },
    {
      resolveSession: () => ({
        session: {} as CopilotSession,
      }),
    },
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "availableTools and excludedTools cannot both be provided",
    errorCode: "INVALID_REQUEST",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-6",
        error: "availableTools and excludedTools cannot both be provided",
        errorCode: "INVALID_REQUEST",
      },
    },
  ]);
});
