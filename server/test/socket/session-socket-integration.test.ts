import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { CopilotSession } from "@github/copilot-sdk";
import { Server, type Socket as ServerSocket } from "socket.io";
import {
  io as createClient,
  type Socket as ClientSocket,
} from "socket.io-client";

import {
  handleSessionModelUpdate,
  handleSessionToolsUpdate,
  registerSocketHandlers,
} from "../../src/socket/handlers.ts";
import { config } from "../../src/config.ts";
import type { SessionEntry } from "../../src/copilot/session-manager.ts";

function waitForClientEvent<T>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for client event: ${event}`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function emitWithAck<T>(
  socket: ClientSocket,
  event: string,
  payload: unknown,
  timeoutMs = 5_000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ack: ${event}`));
    }, timeoutMs);

    socket.emit(event, payload, (ackPayload: T) => {
      clearTimeout(timer);
      resolve(ackPayload);
    });
  });
}

function waitForMs(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

async function withSocketBridge(
  onConnection: (socket: ServerSocket) => void,
): Promise<{
  client: ClientSocket;
  close: () => Promise<void>;
}> {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  io.on("connection", onConnection);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  return { client, close: closeServers };
}

test("socket integration: session:model keeps ack and chat:model synchronized", async () => {
  const nextSession = {} as CopilotSession;

  const { client, close } = await withSocketBridge((socket) => {
    socket.on(
      "session:model",
      async (payload: unknown, ack?: (res: unknown) => void) => {
        await handleSessionModelUpdate(socket, payload, ack, {
          resolveSession: () => ({
            session: {} as CopilotSession,
            availableTools: ["toolA"],
            excludedTools: ["toolB"],
          }),
          reconfigureSession: async () => ({
            model: "gpt-4.1",
            session: nextSession,
          }),
        });
      },
    );
  });

  try {
    const eventPromise = waitForClientEvent<{
      sessionId: string;
      model: string;
    }>(client, "chat:model");
    const ackPromise = emitWithAck<{
      ok: boolean;
      model: string;
    }>(client, "session:model", {
      sessionId: "integration-session-1",
      model: "gpt-4.1",
    });

    const [eventPayload, ackPayload] = await Promise.all([
      eventPromise,
      ackPromise,
    ]);

    assert.deepEqual(eventPayload, {
      sessionId: "integration-session-1",
      model: "gpt-4.1",
    });
    assert.deepEqual(ackPayload, {
      ok: true,
      model: "gpt-4.1",
    });
  } finally {
    await close();
  }
});

test("socket integration: session:tools failure returns ack errorCode and emits chat:error", async () => {
  const { client, close } = await withSocketBridge((socket) => {
    socket.on(
      "session:tools",
      async (payload: unknown, ack?: (res: unknown) => void) => {
        await handleSessionToolsUpdate(socket, payload, ack, {
          resolveSession: () => ({
            session: {} as CopilotSession,
          }),
          reconfigureSession: async () => {
            throw "boom";
          },
        });
      },
    );
  });

  try {
    const eventPromise = waitForClientEvent<{
      sessionId: string | null;
      error: string;
      errorCode: string;
    }>(client, "chat:error");
    const ackPromise = emitWithAck<{
      ok: boolean;
      error: string;
      errorCode: string;
    }>(client, "session:tools", {
      sessionId: "integration-session-2",
      availableTools: ["toolA"],
    });

    const [eventPayload, ackPayload] = await Promise.all([
      eventPromise,
      ackPromise,
    ]);

    assert.deepEqual(ackPayload, {
      ok: false,
      error: "Failed to update tool policy",
      errorCode: "UNKNOWN",
    });
    assert.deepEqual(eventPayload, {
      sessionId: "integration-session-2",
      error: "Failed to update tool policy",
      errorCode: "UNKNOWN",
    });
  } finally {
    await close();
  }
});

test("socket integration: registerSocketHandlers keeps session:model ack and chat:model synchronized", async () => {
  const nextSession = {
    on() {
      return this;
    },
    off() {
      return this;
    },
  } as unknown as CopilotSession;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    modelUpdateDeps: {
      resolveSession: () => ({
        session: {} as CopilotSession,
        availableTools: ["toolA"],
        excludedTools: ["toolB"],
      }),
      reconfigureSession: async () => ({
        model: "gpt-4.1",
        session: nextSession,
      }),
    },
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const eventPromise = waitForClientEvent<{
      sessionId: string;
      model: string;
    }>(client, "chat:model");
    const ackPromise = emitWithAck<{
      ok: boolean;
      model: string;
    }>(client, "session:model", {
      sessionId: "integration-session-register-1",
      model: "gpt-4.1",
    });

    const [eventPayload, ackPayload] = await Promise.all([
      eventPromise,
      ackPromise,
    ]);

    assert.deepEqual(eventPayload, {
      sessionId: "integration-session-register-1",
      model: "gpt-4.1",
    });
    assert.deepEqual(ackPayload, {
      ok: true,
      model: "gpt-4.1",
    });
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send aborts send when mode switch fails", async () => {
  let sendCalled = false;

  const entry = {
    id: "session-mode-fail-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Test",
    mode: "interactive" as const,
    session: {
      rpc: {
        mode: {
          set: async () => {
            throw new Error("mode rpc failed");
          },
        },
      },
      send: async () => {
        sendCalled = true;
      },
    },
  } as unknown as SessionEntry;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-mode-fail-1" ? entry : undefined,
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const errorPayload = waitForClientEvent<{
      sessionId: string | null;
      error: string;
      errorCode: string;
    }>(client, "chat:error");

    client.emit("chat:send", {
      sessionId: "session-mode-fail-1",
      prompt: "hello",
      mode: "plan",
    });

    const payload = await errorPayload;

    assert.equal(payload.sessionId, "session-mode-fail-1");
    assert.equal(payload.errorCode, "MODE_SWITCH_FAILED");
    assert.equal(sendCalled, false);
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send emits fallback answer when web search tools are unavailable", async () => {
  let sendCalled = false;
  let listedModel: string | undefined;
  const fallbackCalls: Array<{
    prompt: string;
    model: string;
    allowAllUrls?: boolean;
    allowedUrls?: readonly string[];
    preferredLocale?: string;
    locale?: string;
    timeZone?: string;
  }> = [];

  const entry = {
    id: "session-fallback-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Fallback test",
    mode: "interactive" as const,
    session: {
      send: async () => {
        sendCalled = true;
      },
    },
  } as unknown as SessionEntry;

  const fakeClient = {
    rpc: {
      tools: {
        list: async ({ model }: { model?: string }) => {
          listedModel = model;
          return { tools: [{ name: "read_file" }] };
        },
      },
    },
  } as unknown;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-fallback-1" ? entry : undefined,
    getClient: async () =>
      fakeClient as Awaited<
        ReturnType<
          typeof import("../../src/copilot/client-manager.ts").getClient
        >
      >,
    runWebSearchFallback: async (options) => {
      fallbackCalls.push({
        prompt: options.prompt,
        model: options.model,
        allowAllUrls: options.allowAllUrls,
        allowedUrls: options.allowedUrls,
        preferredLocale: options.preferredLocale,
        locale: options.locale,
        timeZone: options.timeZone,
      });
      return "天気: 晴れ / 最高 15°C / 最低 8°C / 降水確率 20%";
    },
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const messagePromise = waitForClientEvent<{
      sessionId: string;
      content: string;
      role: string;
      source: string;
      sourceModel: string;
    }>(client, "chat:message");
    const idlePromise = waitForClientEvent<{ sessionId: string }>(
      client,
      "chat:idle",
    );

    client.emit("chat:send", {
      sessionId: "session-fallback-1",
      prompt: "明日の天気は？",
      preferredLocale: "ja-JP",
      locale: "en-US",
      timeZone: "America/New_York",
    });

    const [messagePayload, idlePayload] = await Promise.all([
      messagePromise,
      idlePromise,
    ]);

    assert.equal(listedModel, "gpt-4.1");
    assert.equal(sendCalled, false);
    assert.equal(messagePayload.sessionId, "session-fallback-1");
    assert.equal(messagePayload.role, "assistant");
    assert.equal(messagePayload.source, "web-search-fallback");
    assert.equal(messagePayload.content.includes("最高 15°C"), true);
    assert.equal(messagePayload.content.includes("降水確率 20%"), true);
    assert.equal(
      messagePayload.sourceModel,
      config.copilot.webSearchFallbackModel,
    );
    assert.equal(idlePayload.sessionId, "session-fallback-1");
    assert.equal(fallbackCalls.length, 1);
    assert.equal(fallbackCalls[0]?.prompt, "明日の天気は？");
    assert.equal(
      fallbackCalls[0]?.model,
      config.copilot.webSearchFallbackModel,
    );
    assert.equal(
      fallbackCalls[0]?.allowAllUrls,
      config.copilot.webSearchFallbackAllowAllUrls,
    );
    assert.deepEqual(
      fallbackCalls[0]?.allowedUrls,
      config.copilot.webSearchFallbackAllowedUrls,
    );
    assert.equal(fallbackCalls[0]?.preferredLocale, "ja-JP");
    assert.equal(fallbackCalls[0]?.locale, "en-US");
    assert.equal(fallbackCalls[0]?.timeZone, "America/New_York");
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send carries fallback answer into next sdk send", async () => {
  const sentPrompts: string[] = [];

  const entry = {
    id: "session-fallback-carry-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Fallback carryover test",
    mode: "interactive" as const,
    session: {
      send: async (payload: { prompt?: string }) => {
        sentPrompts.push(payload.prompt ?? "");
      },
    },
  } as unknown as SessionEntry;

  const fakeClient = {
    rpc: {
      tools: {
        list: async () => ({ tools: [{ name: "read_file" }] }),
      },
    },
  } as unknown;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-fallback-carry-1" ? entry : undefined,
    getClient: async () =>
      fakeClient as Awaited<
        ReturnType<
          typeof import("../../src/copilot/client-manager.ts").getClient
        >
      >,
    runWebSearchFallback: async () => "天気: 晴れ / 最高 15°C / 最低 8°C",
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const idlePromise = waitForClientEvent<{ sessionId: string }>(
      client,
      "chat:idle",
    );

    client.emit("chat:send", {
      sessionId: "session-fallback-carry-1",
      prompt: "明日の天気は？",
    });

    const idlePayload = await idlePromise;
    assert.equal(idlePayload.sessionId, "session-fallback-carry-1");

    client.emit("chat:send", {
      sessionId: "session-fallback-carry-1",
      prompt: "その内容を1行で要約して",
    });

    await waitForMs(80);

    assert.equal(sentPrompts.length, 1);
    assert.equal(sentPrompts[0]?.includes("天気: 晴れ / 最高 15°C"), true);
    assert.equal(sentPrompts[0]?.includes("その内容を1行で要約して"), true);
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send uses session tool policy to trigger fallback", async () => {
  let sendCalled = false;
  let listCalled = false;
  let fallbackCalled = false;

  const entry = {
    id: "session-fallback-policy-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Fallback policy test",
    mode: "interactive" as const,
    availableTools: ["mcp_brave-search_brave_web_search", "read_file"],
    excludedTools: ["mcp_brave-search_brave_web_search"],
    session: {
      send: async () => {
        sendCalled = true;
      },
    },
  } as unknown as SessionEntry;

  const fakeClient = {
    rpc: {
      tools: {
        list: async () => {
          listCalled = true;
          return { tools: [{ name: "web_search" }] };
        },
      },
    },
  } as unknown;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-fallback-policy-1" ? entry : undefined,
    getClient: async () =>
      fakeClient as Awaited<
        ReturnType<
          typeof import("../../src/copilot/client-manager.ts").getClient
        >
      >,
    runWebSearchFallback: async () => {
      fallbackCalled = true;
      return "policy fallback result";
    },
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const messagePromise = waitForClientEvent<{
      sessionId: string;
      content: string;
      source: string;
    }>(client, "chat:message");

    client.emit("chat:send", {
      sessionId: "session-fallback-policy-1",
      prompt: "今日のニュースを調べて",
    });

    const messagePayload = await messagePromise;
    assert.equal(messagePayload.sessionId, "session-fallback-policy-1");
    assert.equal(messagePayload.source, "web-search-fallback");
    assert.equal(messagePayload.content, "policy fallback result");
    assert.equal(sendCalled, false);
    assert.equal(listCalled, false);
    assert.equal(fallbackCalled, true);
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send skips fallback when web search tool is available", async () => {
  const sentPrompts: string[] = [];
  let fallbackCalled = false;

  const entry = {
    id: "session-fallback-skip-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Fallback skip test",
    mode: "interactive" as const,
    availableTools: ["web_search", "read_file"],
    session: {
      send: async (payload: { prompt?: string }) => {
        sentPrompts.push(payload.prompt ?? "");
      },
    },
  } as unknown as SessionEntry;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-fallback-skip-1" ? entry : undefined,
    runWebSearchFallback: async () => {
      fallbackCalled = true;
      return "should not be used";
    },
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    client.emit("chat:send", {
      sessionId: "session-fallback-skip-1",
      prompt: "最新ニュースを調べて",
    });

    await waitForMs(80);

    assert.equal(fallbackCalled, false);
    assert.equal(sentPrompts.length, 1);
    assert.equal(sentPrompts[0], "最新ニュースを調べて");
  } finally {
    await closeServers();
  }
});

test("socket integration: chat:send notifies fallback failure and continues sdk send", async () => {
  const sentPrompts: string[] = [];

  const entry = {
    id: "session-fallback-error-1",
    model: "gpt-4.1",
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: "Fallback error test",
    mode: "interactive" as const,
    availableTools: ["read_file"],
    session: {
      send: async (payload: { prompt?: string }) => {
        sentPrompts.push(payload.prompt ?? "");
      },
    },
  } as unknown as SessionEntry;

  const httpServer = createServer();
  const io = new Server(httpServer, {
    transports: ["websocket"],
    cors: {
      origin: true,
    },
  });

  registerSocketHandlers(io, {
    resolveSession: (sessionId) =>
      sessionId === "session-fallback-error-1" ? entry : undefined,
    runWebSearchFallback: async () => {
      throw new Error("fallback command failed");
    },
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = httpServer.address() as AddressInfo;
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    reconnection: false,
  });

  const closeServers = async () => {
    client.disconnect();
    await new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => resolve());
      });
    });
  };

  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", (error) => {
      void closeServers().finally(() => reject(error));
    });
  });

  try {
    const errorPromise = waitForClientEvent<{
      sessionId: string | null;
      error: string;
      errorCode: string;
    }>(client, "chat:error");

    client.emit("chat:send", {
      sessionId: "session-fallback-error-1",
      prompt: "明日の天気を調べて",
    });

    const payload = await errorPromise;
    await waitForMs(80);

    assert.equal(payload.sessionId, "session-fallback-error-1");
    assert.equal(payload.errorCode, "SESSION_ERROR");
    assert.equal(payload.error.includes("Web search fallback failed"), true);
    assert.equal(sentPrompts.length, 1);
    assert.equal(sentPrompts[0], "明日の天気を調べて");
  } finally {
    await closeServers();
  }
});
