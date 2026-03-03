import assert from "node:assert/strict";
import test from "node:test";

import { handleSessionFleetStart } from "../../src/socket/handlers.ts";

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

test("session:fleet_start returns INVALID_REQUEST for missing sessionId", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(socket, { sessionId: "   " }, (payload) => {
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

test("session:fleet_start returns SESSION_NOT_FOUND for unknown session", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(
    socket,
    { sessionId: "session-1" },
    (payload) => {
      ackPayload = payload;
    },
    () => undefined,
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
        sessionId: "session-1",
        error: "Session not found",
        errorCode: "SESSION_NOT_FOUND",
      },
    },
  ]);
});

test("session:fleet_start returns classified error when rpc throws", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(
    socket,
    { sessionId: "session-2" },
    (payload) => {
      ackPayload = payload;
    },
    () => ({
      mode: "interactive",
      session: {
        rpc: {
          fleet: {
            start: async () => {
              throw new Error("client not connected to copilot service");
            },
          },
        },
      },
    }),
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "client not connected to copilot service",
    errorCode: "CLI_NOT_CONNECTED",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-2",
        error: "client not connected to copilot service",
        errorCode: "CLI_NOT_CONNECTED",
      },
    },
  ]);
});

test("session:fleet_start falls back to FLEET_START_FAILED for non-Error throws", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(
    socket,
    { sessionId: "session-2b" },
    (payload) => {
      ackPayload = payload;
    },
    () => ({
      mode: "interactive",
      session: {
        rpc: {
          fleet: {
            start: async () => {
              throw "boom";
            },
          },
        },
      },
    }),
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Failed to start fleet mode",
    errorCode: "FLEET_START_FAILED",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-2b",
        error: "Failed to start fleet mode",
        errorCode: "FLEET_START_FAILED",
      },
    },
  ]);
});

test("session:fleet_start returns FLEET_UNAVAILABLE when started is false", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(
    socket,
    { sessionId: "session-3", prompt: "investigate" },
    (payload) => {
      ackPayload = payload;
    },
    () => ({
      mode: "autopilot",
      session: {
        rpc: {
          fleet: {
            start: async () => ({ started: false }),
          },
        },
      },
    }),
  );

  assert.deepEqual(ackPayload, {
    ok: false,
    error: "Research mode is not available for the selected model.",
    errorCode: "FLEET_UNAVAILABLE",
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:error",
      payload: {
        sessionId: "session-3",
        error: "Research mode is not available for the selected model.",
        errorCode: "FLEET_UNAVAILABLE",
      },
    },
  ]);
});

test("session:fleet_start emits fleet_started and ok ack on success", async () => {
  const { emitted, socket } = createSocketCollector();
  let ackPayload: unknown;

  await handleSessionFleetStart(
    socket,
    { sessionId: "session-4", prompt: "investigate" },
    (payload) => {
      ackPayload = payload;
    },
    () => ({
      mode: "autopilot",
      session: {
        rpc: {
          fleet: {
            start: async (input: { prompt?: string }) => {
              assert.deepEqual(input, { prompt: "investigate" });
              return { started: true };
            },
          },
        },
      },
    }),
  );

  assert.deepEqual(ackPayload, {
    ok: true,
    started: true,
  });
  assert.deepEqual(emitted, [
    {
      event: "chat:fleet_started",
      payload: {
        sessionId: "session-4",
        mode: "autopilot",
      },
    },
  ]);
});
