/**
 * Socket.IO handler — real-time streaming bridge between browser ↔ Copilot SDK.
 *
 * Events (client → server):
 *   chat:send       { sessionId, prompt, mode?, startFleet?, preferredLocation?, preferredLocale?, locale?, timeZone? }
 *   chat:create     { model?, mode?, reasoningEffort?, availableTools?, excludedTools?, systemMessage?, title? }
 *   chat:abort      { sessionId }
 *   session:mode    { sessionId, mode? }
 *   session:model   { sessionId, model }
 *   session:tools   { sessionId, availableTools?, excludedTools? }
 *   session:compact { sessionId }
 *   tools:list      { model? }
 *   account:quota   {}
 *
 * Events (server → client):
 *   chat:delta      { sessionId, content }
 *   chat:message    { sessionId, content, role, messageId }
 *   chat:tool_start { sessionId, toolName, toolCallId }
 *   chat:tool_done  { sessionId, toolName, toolCallId, output, success }
 *   chat:idle       { sessionId }
 *   chat:error      { sessionId, error, errorCode }
 *   chat:created    { sessionId, model, mode, reasoningEffort?, availableTools?, excludedTools?, title, createdAt }
 *   chat:title      { sessionId, title }
 *   chat:mode       { sessionId, mode }
 *   chat:model      { sessionId, model }
 *   chat:tools_updated { sessionId, availableTools?, excludedTools? }
 *   chat:fleet_started { sessionId, mode }
 *   chat:compacted  { sessionId, success, tokensRemoved, messagesRemoved }
 *   chat:subagent_start { sessionId, agentName }
 *   chat:subagent_done  { sessionId, agentName }
 */

import type { Server, Socket } from "socket.io";
import type { CopilotSession } from "@github/copilot-sdk";
import type { ChatErrorCode } from "../../../shared/chat-error-code.js";
import { config } from "../config.js";
import { getClient } from "../copilot/client-manager.js";
import {
  isWebSearchToolAvailable,
  isLikelyWebSearchPrompt,
  runWebSearchFallback,
} from "../copilot/web-search-fallback.js";
import {
  type AgentMode,
  type SessionReasoningEffort,
  createSession,
  getSession,
  deleteSession,
  listSessions,
  reconfigureSessionTools,
  updateSessionMode,
  updateSessionTitle,
} from "../copilot/session-manager.js";

type SessionMode = AgentMode;
type SocketAck = (payload: unknown) => void;

interface SessionScopedPayload {
  sessionId?: string;
}

type SessionListEntry = ReturnType<typeof listSessions>[number];

type ModelsSettled = PromiseSettledResult<string[] | undefined>;
type ToolsSettled = PromiseSettledResult<{ tools?: unknown } | undefined>;
type QuotaSettled = PromiseSettledResult<
  { quotaSnapshots?: Record<string, unknown> } | undefined
>;

export type { ChatErrorCode } from "../../../shared/chat-error-code.js";

const sessionCleanupRegistry = new Map<string, Set<() => void>>();
const fallbackCarryoverBySession = new Map<string, string>();
const FALLBACK_CARRYOVER_MAX_CHARS = 2_000;

export function buildBootstrapStatePayload(
  sessions: SessionListEntry[],
  modelsResult: ModelsSettled,
  toolsResult: ToolsSettled,
  quotaResult: QuotaSettled,
): {
  sessions: SessionListEntry[];
  models: string[];
  tools: string[];
  quota: Record<string, unknown>;
} {
  const models =
    modelsResult.status === "fulfilled" && Array.isArray(modelsResult.value)
      ? modelsResult.value
      : [];

  const toolsRaw =
    toolsResult.status === "fulfilled" &&
    toolsResult.value &&
    Array.isArray(toolsResult.value.tools)
      ? toolsResult.value.tools
      : [];

  const tools = toolsRaw.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );

  const quota =
    quotaResult.status === "fulfilled" &&
    quotaResult.value?.quotaSnapshots &&
    typeof quotaResult.value.quotaSnapshots === "object"
      ? quotaResult.value.quotaSnapshots
      : {};

  return {
    sessions,
    models,
    tools,
    quota,
  };
}

function isSessionMode(value: unknown): value is SessionMode {
  return value === "interactive" || value === "plan" || value === "autopilot";
}

function isReasoningEffort(value: unknown): value is SessionReasoningEffort {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  );
}

function normalizeToolNames(payload: unknown): string[] | undefined {
  if (!Array.isArray(payload)) return undefined;
  const tools = payload
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return tools.length > 0 ? tools : undefined;
}

function toRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

function toTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function isSocketAck(value: unknown): value is SocketAck {
  return typeof value === "function";
}

function resolveAck(payload: unknown, ack?: SocketAck): SocketAck | undefined {
  return isSocketAck(payload) ? payload : ack;
}

function resolvePayload(payload: unknown): unknown {
  return isSocketAck(payload) ? undefined : payload;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function toSafeErrorSummary(error: unknown): {
  name?: string;
  code?: string | number;
  message: string;
} {
  if (error && typeof error === "object") {
    const maybeError = error as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };

    return {
      name: typeof maybeError.name === "string" ? maybeError.name : undefined,
      code:
        typeof maybeError.code === "string" ||
        typeof maybeError.code === "number"
          ? maybeError.code
          : undefined,
      message: getErrorMessage(error, "Unknown error"),
    };
  }

  return { message: getErrorMessage(error, "Unknown error") };
}

function getEventData(event: unknown): Record<string, unknown> {
  if (!event || typeof event !== "object") return {};
  const rawData = (event as { data?: unknown }).data;
  if (!rawData || typeof rawData !== "object") return {};
  return rawData as Record<string, unknown>;
}

export function resolveSessionErrorMessage(
  data: Record<string, unknown>,
): string {
  const directMessage = toTrimmedString(data.message);
  if (directMessage) return directMessage;

  const rawError = data.error;
  if (typeof rawError === "string") {
    const stringError = toTrimmedString(rawError);
    if (stringError) return stringError;
  }

  if (rawError && typeof rawError === "object") {
    const nestedMessage = toTrimmedString(
      (rawError as { message?: unknown }).message,
    );
    if (nestedMessage) return nestedMessage;
  }

  return "Session error occurred";
}

function normalizeToolOutput(output: unknown): string | undefined {
  if (output == null) return undefined;
  if (typeof output === "string") return output;
  if (typeof output === "number" || typeof output === "boolean") {
    return String(output);
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function buildPromptWithFallbackCarryover(
  prompt: string,
  fallbackCarryover: string | undefined,
): string {
  if (!fallbackCarryover) {
    return prompt;
  }

  return [
    "Previous web-search fallback answer already shown to the user (use this as conversational context):",
    fallbackCarryover,
    "",
    "User message:",
    prompt,
  ].join("\n");
}

function rememberFallbackCarryover(sessionId: string, content: string) {
  const normalized = content.trim();
  if (!normalized) return;

  const clipped =
    normalized.length > FALLBACK_CARRYOVER_MAX_CHARS
      ? `${normalized.slice(0, FALLBACK_CARRYOVER_MAX_CHARS)}…`
      : normalized;

  fallbackCarryoverBySession.set(sessionId, clipped);
}

function consumeFallbackCarryover(sessionId: string): string | undefined {
  const content = fallbackCarryoverBySession.get(sessionId);
  if (!content) return undefined;
  fallbackCarryoverBySession.delete(sessionId);
  return content;
}

export function classifyChatErrorCode(message: string): ChatErrorCode {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "UNKNOWN";

  if (normalized.includes("missing sessionid or prompt")) {
    return "INVALID_REQUEST";
  }
  if (
    normalized.includes("invalid sessionid") ||
    normalized.includes("invalid model") ||
    normalized.includes("invalid mode") ||
    normalized.includes("invalid sessionid or title")
  ) {
    return "INVALID_REQUEST";
  }
  if (normalized.includes("session not found")) {
    return "SESSION_NOT_FOUND";
  }
  if (normalized.includes("failed to switch mode")) {
    return "MODE_SWITCH_FAILED";
  }
  if (normalized.includes("research mode is not available")) {
    return "FLEET_UNAVAILABLE";
  }
  if (normalized.includes("research mode failed to start")) {
    return "FLEET_START_FAILED";
  }
  if (normalized.includes("failed to start fleet mode")) {
    return "FLEET_START_FAILED";
  }
  if (normalized.includes("failed to send message")) {
    return "SEND_FAILED";
  }
  if (normalized.includes("failed to create session")) {
    return "CREATE_SESSION_FAILED";
  }
  if (normalized.includes("failed to load models")) {
    return "MODEL_LIST_FAILED";
  }
  if (normalized.includes("failed to load tools")) {
    return "TOOLS_LIST_FAILED";
  }
  if (normalized.includes("session error occurred")) {
    return "SESSION_ERROR";
  }
  if (normalized.includes("copilot cli not found")) {
    return "CLI_NOT_FOUND";
  }
  if (
    normalized.includes("spawn") &&
    (normalized.includes("einval") ||
      normalized.includes("enoent") ||
      normalized.includes("eacces") ||
      normalized.includes("eperm"))
  ) {
    return "CLI_SPAWN_FAILED";
  }
  if (normalized.includes("client not connected")) {
    return "CLI_NOT_CONNECTED";
  }
  if (
    normalized.includes("not authenticated") ||
    normalized.includes("unauthorized") ||
    normalized.includes("auth required") ||
    normalized.includes("authentication required") ||
    normalized.includes("requires authentication") ||
    normalized.includes("please login") ||
    normalized.includes("please log in")
  ) {
    return "AUTH_REQUIRED";
  }

  return "UNKNOWN";
}

export function buildChatErrorPayload(
  sessionId: string | null | undefined,
  error: string,
  errorCode?: ChatErrorCode,
) {
  const message = error.trim().length > 0 ? error : "Unknown error";
  return {
    sessionId: sessionId ?? null,
    error: message,
    errorCode: errorCode ?? classifyChatErrorCode(message),
  };
}

export function buildAckErrorPayload(error: string, errorCode?: ChatErrorCode) {
  const message = error.trim().length > 0 ? error : "Unknown error";
  return {
    ok: false as const,
    error: message,
    errorCode: errorCode ?? classifyChatErrorCode(message),
  };
}

const chatErrorMetrics = new Map<ChatErrorCode, number>();

function recordChatErrorMetric(payload: {
  sessionId: string | null;
  error: string;
  errorCode: ChatErrorCode;
}) {
  const nextCount = (chatErrorMetrics.get(payload.errorCode) ?? 0) + 1;
  chatErrorMetrics.set(payload.errorCode, nextCount);

  if (
    payload.errorCode === "UNKNOWN" &&
    nextCount >= config.observability.chatErrorUnknownWarnThreshold &&
    nextCount % config.observability.chatErrorUnknownWarnThreshold === 0
  ) {
    console.error(
      `[ws] chat:error UNKNOWN threshold reached count=${nextCount} sessionId=${payload.sessionId ?? "null"} message=${payload.error}`,
    );
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[ws] chat:error code=${payload.errorCode} count=${nextCount} sessionId=${payload.sessionId ?? "null"} message=${payload.error}`,
    );
  }
}

export function getChatErrorMetricsSnapshot(): Partial<
  Record<ChatErrorCode, number>
> {
  return Object.fromEntries(chatErrorMetrics.entries()) as Partial<
    Record<ChatErrorCode, number>
  >;
}

export function resetChatErrorMetricsForTest() {
  chatErrorMetrics.clear();
}

export function emitChatError(
  socket: Pick<Socket, "emit">,
  sessionId: string | null | undefined,
  error: string,
  errorCode?: ChatErrorCode,
) {
  const payload = buildChatErrorPayload(sessionId, error, errorCode);
  recordChatErrorMetric(payload);
  socket.emit("chat:error", payload);
}

function ackAndEmitError(
  socket: Pick<Socket, "emit">,
  sessionId: string | null | undefined,
  ack: SocketAck | undefined,
  error: string,
  errorCode?: ChatErrorCode,
) {
  const ackPayload = buildAckErrorPayload(error, errorCode);
  ack?.(ackPayload);
  emitChatError(socket, sessionId, ackPayload.error, ackPayload.errorCode);
}

type FleetStartSessionEntry = {
  mode: SessionMode;
  session: {
    rpc: {
      fleet: {
        start: (payload: { prompt?: string }) => Promise<{ started: boolean }>;
      };
    };
  };
};

function resolveFleetStartErrorCode(message: string): ChatErrorCode {
  const classified = classifyChatErrorCode(message);
  return classified === "UNKNOWN" ? "FLEET_START_FAILED" : classified;
}

interface RegisterSocketHandlersDependencies {
  resolveSession?: typeof getSession;
  getClient?: typeof getClient;
  runWebSearchFallback?: typeof runWebSearchFallback;
  modelUpdateDeps?: Omit<SessionModelUpdateDependencies, "rebindSessionEvents">;
  toolsUpdateDeps?: Omit<SessionToolsUpdateDependencies, "rebindSessionEvents">;
  fleetStartResolveSession?: (
    sessionId: string,
  ) => FleetStartSessionEntry | undefined;
}

export async function handleSessionFleetStart(
  socket: Pick<Socket, "emit">,
  payload: unknown,
  ack?: SocketAck,
  resolveSession: (sessionId: string) => FleetStartSessionEntry | undefined = (
    sessionId,
  ) => getSession(sessionId) as FleetStartSessionEntry | undefined,
) {
  const body = toRecord(payload);
  const sessionId = toTrimmedString(body.sessionId);
  const prompt = toTrimmedString(body.prompt);
  if (!sessionId) {
    const errorPayload = buildAckErrorPayload(
      "Invalid sessionId",
      "INVALID_REQUEST",
    );
    ack?.(errorPayload);
    emitChatError(socket, null, errorPayload.error, errorPayload.errorCode);
    return;
  }

  const entry = resolveSession(sessionId);
  if (!entry) {
    const errorPayload = buildAckErrorPayload(
      "Session not found",
      "SESSION_NOT_FOUND",
    );
    ack?.(errorPayload);
    emitChatError(
      socket,
      sessionId,
      errorPayload.error,
      errorPayload.errorCode,
    );
    return;
  }

  try {
    const result = await entry.session.rpc.fleet.start(
      prompt ? { prompt } : {},
    );
    if (result.started) {
      socket.emit("chat:fleet_started", {
        sessionId,
        mode: entry.mode,
      });
      ack?.({ ok: true, started: true });
      return;
    }

    const errorPayload = buildAckErrorPayload(
      "Research mode is not available for the selected model.",
      "FLEET_UNAVAILABLE",
    );
    ack?.(errorPayload);
    emitChatError(
      socket,
      sessionId,
      errorPayload.error,
      errorPayload.errorCode,
    );
  } catch (err: unknown) {
    const message = getErrorMessage(err, "Failed to start fleet mode");
    const errorPayload = buildAckErrorPayload(
      message,
      resolveFleetStartErrorCode(message),
    );
    ack?.(errorPayload);
    emitChatError(
      socket,
      sessionId,
      errorPayload.error,
      errorPayload.errorCode,
    );
  }
}

type SessionModelUpdateEntry = {
  session: CopilotSession;
  availableTools?: string[];
  excludedTools?: string[];
};

type SessionModelUpdateResult = {
  model: string;
  session: CopilotSession;
};

type SessionToolsUpdateResult = {
  session: CopilotSession;
  availableTools?: string[];
  excludedTools?: string[];
};

interface SessionModelUpdateDependencies {
  resolveSession?: (sessionId: string) => SessionModelUpdateEntry | undefined;
  reconfigureSession?: (
    sessionId: string,
    options: {
      model: string;
      availableTools?: string[];
      excludedTools?: string[];
    },
  ) => Promise<SessionModelUpdateResult | null>;
  rebindSessionEvents?: (sessionId: string, session: CopilotSession) => void;
}

async function defaultReconfigureSessionModel(
  sessionId: string,
  options: {
    model: string;
    availableTools?: string[];
    excludedTools?: string[];
  },
): Promise<SessionModelUpdateResult | null> {
  const client = await getClient();
  return (await reconfigureSessionTools(
    client,
    sessionId,
    options,
  )) as SessionModelUpdateResult | null;
}

export async function handleSessionModelUpdate(
  socket: Pick<Socket, "emit">,
  payload: unknown,
  ack?: SocketAck,
  deps: SessionModelUpdateDependencies = {},
) {
  const body = toRecord(payload);
  const sessionId = toTrimmedString(body.sessionId);
  const model = toTrimmedString(body.model);
  if (!sessionId) {
    ackAndEmitError(socket, null, ack, "Invalid sessionId", "INVALID_REQUEST");
    return;
  }
  if (!model) {
    ackAndEmitError(socket, sessionId, ack, "Invalid model", "INVALID_REQUEST");
    return;
  }

  const resolveSessionEntry =
    deps.resolveSession ??
    ((id: string) => getSession(id) as SessionModelUpdateEntry | undefined);

  const entry = resolveSessionEntry(sessionId);
  if (!entry) {
    ackAndEmitError(
      socket,
      sessionId,
      ack,
      "Session not found",
      "SESSION_NOT_FOUND",
    );
    return;
  }

  const reconfigure = deps.reconfigureSession ?? defaultReconfigureSessionModel;

  try {
    const updated = await reconfigure(sessionId, {
      model,
      availableTools: entry.availableTools,
      excludedTools: entry.excludedTools,
    });

    if (!updated) {
      ackAndEmitError(
        socket,
        sessionId,
        ack,
        "Session not found",
        "SESSION_NOT_FOUND",
      );
      return;
    }

    deps.rebindSessionEvents?.(sessionId, updated.session);

    socket.emit("chat:model", {
      sessionId,
      model: updated.model,
    });
    ack?.({ ok: true, model: updated.model });
  } catch (err: unknown) {
    ackAndEmitError(
      socket,
      sessionId,
      ack,
      getErrorMessage(err, "Failed to set model"),
    );
  }
}

interface SessionToolsUpdateDependencies {
  resolveSession?: (sessionId: string) => SessionModelUpdateEntry | undefined;
  reconfigureSession?: (
    sessionId: string,
    options: {
      availableTools?: string[];
      excludedTools?: string[];
    },
  ) => Promise<SessionToolsUpdateResult | null>;
  rebindSessionEvents?: (sessionId: string, session: CopilotSession) => void;
}

async function defaultReconfigureSessionTools(
  sessionId: string,
  options: {
    availableTools?: string[];
    excludedTools?: string[];
  },
): Promise<SessionToolsUpdateResult | null> {
  const client = await getClient();
  return (await reconfigureSessionTools(
    client,
    sessionId,
    options,
  )) as SessionToolsUpdateResult | null;
}

export async function handleSessionToolsUpdate(
  socket: Pick<Socket, "emit">,
  payload: unknown,
  ack?: SocketAck,
  deps: SessionToolsUpdateDependencies = {},
) {
  const body = toRecord(payload);
  const sessionId = toTrimmedString(body.sessionId);
  if (!sessionId) {
    ackAndEmitError(socket, null, ack, "Invalid sessionId", "INVALID_REQUEST");
    return;
  }

  const resolveSessionEntry =
    deps.resolveSession ??
    ((id: string) => getSession(id) as SessionModelUpdateEntry | undefined);

  const entry = resolveSessionEntry(sessionId);
  if (!entry) {
    ackAndEmitError(
      socket,
      sessionId,
      ack,
      "Session not found",
      "SESSION_NOT_FOUND",
    );
    return;
  }

  const reconfigure = deps.reconfigureSession ?? defaultReconfigureSessionTools;
  const availableTools = normalizeToolNames(body.availableTools);
  const excludedTools = normalizeToolNames(body.excludedTools);

  if (availableTools && excludedTools) {
    ackAndEmitError(
      socket,
      sessionId,
      ack,
      "availableTools and excludedTools cannot both be provided",
      "INVALID_REQUEST",
    );
    return;
  }

  try {
    const updated = await reconfigure(sessionId, {
      availableTools,
      excludedTools,
    });

    if (!updated) {
      ackAndEmitError(
        socket,
        sessionId,
        ack,
        "Session not found",
        "SESSION_NOT_FOUND",
      );
      return;
    }

    deps.rebindSessionEvents?.(sessionId, updated.session);

    socket.emit("chat:tools_updated", {
      sessionId,
      availableTools: updated.availableTools,
      excludedTools: updated.excludedTools,
    });

    ack?.({
      ok: true,
      availableTools: updated.availableTools,
      excludedTools: updated.excludedTools,
    });
  } catch (err: unknown) {
    ackAndEmitError(
      socket,
      sessionId,
      ack,
      getErrorMessage(err, "Failed to update tool policy"),
    );
  }
}

function trackSessionCleanup(sessionId: string, cleanup: () => void) {
  const cleanups =
    sessionCleanupRegistry.get(sessionId) ?? new Set<() => void>();
  cleanups.add(cleanup);
  sessionCleanupRegistry.set(sessionId, cleanups);
}

function untrackSessionCleanup(sessionId: string, cleanup: () => void) {
  const cleanups = sessionCleanupRegistry.get(sessionId);
  if (!cleanups) return;
  cleanups.delete(cleanup);
  if (cleanups.size === 0) {
    sessionCleanupRegistry.delete(sessionId);
  }
}

export function cleanupSessionBindings(sessionId: string): number {
  const cleanups = sessionCleanupRegistry.get(sessionId);
  if (!cleanups || cleanups.size === 0) return 0;
  const targets = [...cleanups];
  for (const cleanup of targets) {
    cleanup();
  }
  return targets.length;
}

export function registerSocketHandlers(
  io: Server,
  deps: RegisterSocketHandlersDependencies = {},
) {
  const resolveSession = deps.resolveSession ?? getSession;
  const getClientImpl = deps.getClient ?? getClient;
  const runWebSearchFallbackImpl =
    deps.runWebSearchFallback ?? runWebSearchFallback;
  const resolveFleetStartSession =
    deps.fleetStartResolveSession ??
    ((sessionId: string) =>
      resolveSession(sessionId) as FleetStartSessionEntry | undefined);

  io.on("connection", (socket: Socket) => {
    console.log(`[ws] Client connected: ${socket.id}`);
    const sessionCleanups = new Map<string, () => void>();

    const bindSessionEvents = (sessionId: string, session: CopilotSession) => {
      const wiredCleanup = wireSessionEvents(socket, sessionId, session);
      const cleanup = () => {
        wiredCleanup();
        sessionCleanups.delete(sessionId);
        untrackSessionCleanup(sessionId, cleanup);
      };
      trackSessionCleanup(sessionId, cleanup);
      return cleanup;
    };

    const rebindSessionEvents = (
      sessionId: string,
      session: CopilotSession,
    ) => {
      const existingCleanup = sessionCleanups.get(sessionId);
      existingCleanup?.();
      const rewiredCleanup = bindSessionEvents(sessionId, session);
      sessionCleanups.set(sessionId, rewiredCleanup);
    };

    const emitSystemError = (error: unknown, fallback: string) => {
      emitChatError(socket, null, getErrorMessage(error, fallback));
    };

    // ── Create a new chat session ───────────────────────────
    socket.on("chat:create", async (payload: unknown, ack?: SocketAck) => {
      try {
        const body = toRecord(payload);
        const client = await getClientImpl();
        const requestedMode = isSessionMode(body.mode) ? body.mode : undefined;
        const requestedReasoningEffort = isReasoningEffort(body.reasoningEffort)
          ? body.reasoningEffort
          : undefined;
        const entry = await createSession(client, {
          model: toTrimmedString(body.model),
          systemMessage: toTrimmedString(body.systemMessage),
          title: toTrimmedString(body.title),
          mode: requestedMode,
          reasoningEffort: requestedReasoningEffort,
          availableTools: normalizeToolNames(body.availableTools),
          excludedTools: normalizeToolNames(body.excludedTools),
        });

        // Wire up SDK events → socket events
        rebindSessionEvents(entry.id, entry.session);

        const res = {
          ok: true,
          sessionId: entry.id,
          model: entry.model,
          title: entry.title,
          createdAt: entry.createdAt,
          mode: entry.mode,
          reasoningEffort: entry.reasoningEffort,
          availableTools: entry.availableTools,
          excludedTools: entry.excludedTools,
        };
        ack?.(res);
        socket.emit("chat:created", res);
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err, "Failed to create session");
        const errorCode = classifyChatErrorCode(errorMessage);
        console.error("[ws] chat:create error:", err);
        ack?.({
          ok: false,
          error: errorMessage,
          errorCode,
        });
        emitChatError(socket, null, errorMessage, errorCode);
      }
    });

    // ── Send a message ──────────────────────────────────────
    socket.on("chat:send", async (payload: unknown) => {
      const body = toRecord(payload);
      const sessionId = toTrimmedString(body.sessionId);
      const prompt = toTrimmedString(body.prompt);
      const startFleet = toBoolean(body.startFleet);
      const preferredLocation = toTrimmedString(body.preferredLocation);
      const preferredLocale = toTrimmedString(body.preferredLocale);
      const locale = toTrimmedString(body.locale);
      const timeZone = toTrimmedString(body.timeZone);
      if (!sessionId || !prompt) {
        emitChatError(
          socket,
          sessionId,
          "Missing sessionId or prompt",
          "INVALID_REQUEST",
        );
        return;
      }

      const entry = resolveSession(sessionId);
      if (!entry) {
        emitChatError(
          socket,
          sessionId,
          "Session not found",
          "SESSION_NOT_FOUND",
        );
        return;
      }

      entry.lastUsed = Date.now();

      try {
        const requestedMode = isSessionMode(body.mode) ? body.mode : undefined;
        if (requestedMode && requestedMode !== entry.mode) {
          try {
            const modeResult = await entry.session.rpc.mode.set({
              mode: requestedMode,
            });
            updateSessionMode(sessionId, modeResult.mode);
            socket.emit("chat:mode", {
              sessionId,
              mode: modeResult.mode,
            });
          } catch (modeError: unknown) {
            emitChatError(
              socket,
              sessionId,
              getErrorMessage(modeError, "Failed to switch mode"),
              "MODE_SWITCH_FAILED",
            );
            return;
          }
        }

        if (startFleet) {
          await handleSessionFleetStart(
            socket,
            { sessionId, prompt },
            undefined,
            resolveFleetStartSession,
          );
          return;
        }

        if (
          config.copilot.enableWebSearchFallback &&
          isLikelyWebSearchPrompt(prompt)
        ) {
          try {
            let modelTools: unknown[] | undefined;
            if (!entry.availableTools || entry.availableTools.length === 0) {
              const client = await getClientImpl();
              const toolsResult = await client.rpc.tools.list({
                model: entry.model,
              });
              modelTools = Array.isArray(toolsResult?.tools)
                ? toolsResult.tools
                : [];
            }

            const hasEffectiveWebSearchTool = isWebSearchToolAvailable({
              availableTools: entry.availableTools,
              excludedTools: entry.excludedTools,
              modelTools,
            });

            if (!hasEffectiveWebSearchTool) {
              const fallbackContent = await runWebSearchFallbackImpl({
                cliPath: config.copilot.cliPath,
                prompt,
                model: config.copilot.webSearchFallbackModel,
                allowAllUrls: config.copilot.webSearchFallbackAllowAllUrls,
                allowedUrls: config.copilot.webSearchFallbackAllowedUrls,
                timeoutMs: config.copilot.webSearchFallbackTimeoutMs,
                preferredLocation:
                  preferredLocation ??
                  config.copilot.webSearchFallbackDefaultLocation,
                preferredLocale:
                  preferredLocale ??
                  config.copilot.webSearchFallbackDefaultLocale,
                locale,
                timeZone:
                  timeZone ?? config.copilot.webSearchFallbackDefaultTimeZone,
              });

              rememberFallbackCarryover(sessionId, fallbackContent);

              socket.emit("chat:message", {
                sessionId,
                content: fallbackContent,
                role: "assistant",
                source: "web-search-fallback",
                sourceModel: config.copilot.webSearchFallbackModel,
                messageId: `fallback-web-${Date.now()}`,
              });
              socket.emit("chat:idle", { sessionId });
              return;
            }
          } catch (fallbackError: unknown) {
            console.warn(
              "[ws] web-search fallback skipped",
              toSafeErrorSummary(fallbackError),
            );
            emitChatError(
              socket,
              sessionId,
              "Web search fallback failed. Continuing with regular model response.",
              "SESSION_ERROR",
            );
          }
        }

        // session.send() returns a promise — events are delivered via wired handlers
        const promptWithCarryover = buildPromptWithFallbackCarryover(
          prompt,
          consumeFallbackCarryover(sessionId),
        );
        await entry.session.send({ prompt: promptWithCarryover });
      } catch (err: unknown) {
        emitChatError(
          socket,
          sessionId,
          getErrorMessage(err, "Failed to send message"),
          "SEND_FAILED",
        );
      }
    });

    // ── Abort current generation ────────────────────────────
    socket.on("chat:abort", async (payload: SessionScopedPayload) => {
      const entry = resolveSession(payload?.sessionId ?? "");
      if (entry) {
        try {
          await entry.session.abort();
        } catch {
          /* best-effort */
        }
      }
    });

    // ── List sessions ───────────────────────────────────────
    socket.on("sessions:list", (payload: unknown, ack?: SocketAck) => {
      const callback = resolveAck(payload, ack);
      callback?.(listSessions());
    });

    // ── Delete session ──────────────────────────────────────
    socket.on("session:delete", async (payload: unknown, ack?: SocketAck) => {
      try {
        const body = toRecord(payload);
        const sessionId = toTrimmedString(body.sessionId);
        if (!sessionId) {
          ackAndEmitError(
            socket,
            null,
            ack,
            "Invalid sessionId",
            "INVALID_REQUEST",
          );
          return;
        }

        const client = await getClientImpl();
        const ok = await deleteSession(client, sessionId);
        if (!ok) {
          ackAndEmitError(
            socket,
            sessionId,
            ack,
            "Session not found",
            "SESSION_NOT_FOUND",
          );
          return;
        }

        cleanupSessionBindings(sessionId);
        sessionCleanups.delete(sessionId);
        fallbackCarryoverBySession.delete(sessionId);
        ack?.({ ok: true });
      } catch (err: unknown) {
        ackAndEmitError(
          socket,
          null,
          ack,
          getErrorMessage(err, "Failed to delete session"),
        );
      }
    });

    // ── Rename session ──────────────────────────────────────
    socket.on("session:rename", (payload: unknown, ack?: SocketAck) => {
      const body = toRecord(payload);
      const sessionId = toTrimmedString(body.sessionId);
      const title = toTrimmedString(body.title);
      if (!sessionId || !title) {
        ackAndEmitError(
          socket,
          null,
          ack,
          "Invalid sessionId or title",
          "INVALID_REQUEST",
        );
        return;
      }
      const ok = updateSessionTitle(sessionId, title);
      if (!ok) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          "Session not found",
          "SESSION_NOT_FOUND",
        );
        return;
      }
      ack?.({ ok: true });
    });

    socket.on("session:mode", async (payload: unknown, ack?: SocketAck) => {
      const body = toRecord(payload);
      const sessionId = toTrimmedString(body.sessionId);
      if (!sessionId) {
        ackAndEmitError(
          socket,
          null,
          ack,
          "Invalid sessionId",
          "INVALID_REQUEST",
        );
        return;
      }
      const entry = resolveSession(sessionId);
      if (!entry) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          "Session not found",
          "SESSION_NOT_FOUND",
        );
        return;
      }

      if (body.mode == null) {
        try {
          const modeResult = await entry.session.rpc.mode.get();
          updateSessionMode(sessionId, modeResult.mode);
          ack?.({ ok: true, mode: modeResult.mode });
        } catch (err: unknown) {
          ackAndEmitError(
            socket,
            sessionId,
            ack,
            getErrorMessage(err, "Failed to get mode"),
          );
        }
        return;
      }

      if (!isSessionMode(body.mode)) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          "Invalid mode",
          "INVALID_REQUEST",
        );
        return;
      }

      try {
        const modeResult = await entry.session.rpc.mode.set({
          mode: body.mode,
        });
        updateSessionMode(sessionId, modeResult.mode);
        socket.emit("chat:mode", {
          sessionId,
          mode: modeResult.mode,
        });
        ack?.({ ok: true, mode: modeResult.mode });
      } catch (err: unknown) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          getErrorMessage(err, "Failed to set mode"),
        );
      }
    });

    socket.on("session:model", async (payload: unknown, ack?: SocketAck) => {
      await handleSessionModelUpdate(socket, payload, ack, {
        ...deps.modelUpdateDeps,
        rebindSessionEvents,
      });
    });

    socket.on("session:tools", async (payload: unknown, ack?: SocketAck) => {
      await handleSessionToolsUpdate(socket, payload, ack, {
        ...deps.toolsUpdateDeps,
        rebindSessionEvents,
      });
    });

    socket.on("session:compact", async (payload: unknown, ack?: SocketAck) => {
      const body = toRecord(payload);
      const sessionId = toTrimmedString(body.sessionId);
      if (!sessionId) {
        ackAndEmitError(
          socket,
          null,
          ack,
          "Invalid sessionId",
          "INVALID_REQUEST",
        );
        return;
      }
      const entry = resolveSession(sessionId);
      if (!entry) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          "Session not found",
          "SESSION_NOT_FOUND",
        );
        return;
      }

      try {
        const result = await entry.session.rpc.compaction.compact();
        socket.emit("chat:compacted", {
          sessionId,
          ...result,
        });
        ack?.({ ok: true, ...result });
      } catch (err: unknown) {
        ackAndEmitError(
          socket,
          sessionId,
          ack,
          getErrorMessage(err, "Failed to compact session"),
        );
      }
    });

    socket.on(
      "session:fleet_start",
      async (payload: unknown, ack?: SocketAck) => {
        await handleSessionFleetStart(
          socket,
          payload,
          ack,
          resolveFleetStartSession,
        );
      },
    );

    // ── List available models ───────────────────────────────
    socket.on("models:list", async (payload: unknown, ack?: SocketAck) => {
      const callback = resolveAck(payload, ack);
      try {
        const client = await getClientImpl();
        const models = await client.listModels();
        callback?.(models ?? []);
      } catch (err: unknown) {
        callback?.([]);
        emitSystemError(err, "Failed to load models");
      }
    });

    socket.on("tools:list", async (payload: unknown, ack?: SocketAck) => {
      const callback = resolveAck(payload, ack);
      try {
        const body = toRecord(resolvePayload(payload));
        const client = await getClientImpl();
        const model = toTrimmedString(body.model);
        const result = await client.rpc.tools.list({ model });
        callback?.(result.tools ?? []);
      } catch (err: unknown) {
        callback?.([]);
        emitSystemError(err, "Failed to load tools");
      }
    });

    socket.on("account:quota", async (payload: unknown, ack?: SocketAck) => {
      const callback = resolveAck(payload, ack);
      try {
        const client = await getClientImpl();
        const quota = await client.rpc.account.getQuota();
        callback?.(quota?.quotaSnapshots ?? {});
      } catch {
        callback?.({});
      }
    });

    socket.on("disconnect", () => {
      for (const cleanup of sessionCleanups.values()) {
        cleanup();
      }
      sessionCleanups.clear();
      console.log(`[ws] Client disconnected: ${socket.id}`);
    });
  });
}

// ── Pipe SDK session events to the Socket.IO client ─────────

function wireSessionEvents(
  socket: Socket,
  sessionId: string,
  session: CopilotSession,
) {
  const onAssistantMessageDelta = (event: unknown) => {
    const data = getEventData(event);
    socket.emit("chat:delta", {
      sessionId,
      content: typeof data.deltaContent === "string" ? data.deltaContent : "",
    });
  };

  const onAssistantMessage = (event: unknown) => {
    const data = getEventData(event);
    socket.emit("chat:message", {
      sessionId,
      content: typeof data.content === "string" ? data.content : "",
      role: "assistant",
      messageId: data.messageId,
    });
  };

  const onToolExecutionStart = (event: unknown) => {
    const data = getEventData(event);
    socket.emit("chat:tool_start", {
      sessionId,
      toolCallId:
        typeof data.toolCallId === "string" ? data.toolCallId : undefined,
      toolName:
        typeof data.toolName === "string" ? data.toolName : "unknown_tool",
    });
  };

  const onToolExecutionComplete = (event: unknown) => {
    const data = getEventData(event);
    socket.emit("chat:tool_done", {
      sessionId,
      toolCallId:
        typeof data.toolCallId === "string" ? data.toolCallId : undefined,
      toolName:
        typeof data.toolName === "string" ? data.toolName : "unknown_tool",
      output: normalizeToolOutput(data.output),
      success: data.success === true,
    });
  };

  const onSessionIdle = () => {
    socket.emit("chat:idle", { sessionId });
  };

  const onSessionError = (event: unknown) => {
    const data = getEventData(event);
    const message = resolveSessionErrorMessage(data);
    emitChatError(socket, sessionId, message);
  };

  const onSessionTitleChanged = (event: unknown) => {
    const data = getEventData(event);
    const title = toTrimmedString(data.title);
    if (!title) return;
    updateSessionTitle(sessionId, title);
    socket.emit("chat:title", {
      sessionId,
      title,
    });
  };

  const onSubagentStarted = (event: unknown) => {
    const data = getEventData(event);
    const agentDisplayName = toTrimmedString(data.agentDisplayName);
    const agentName = toTrimmedString(data.agentName);
    socket.emit("chat:subagent_start", {
      sessionId,
      agentName: agentDisplayName ?? agentName ?? "unknown",
    });
  };

  const onSubagentCompleted = (event: unknown) => {
    const data = getEventData(event);
    const agentDisplayName = toTrimmedString(data.agentDisplayName);
    const agentName = toTrimmedString(data.agentName);
    socket.emit("chat:subagent_done", {
      sessionId,
      agentName: agentDisplayName ?? agentName ?? "unknown",
    });
  };

  // Streaming deltas (token-by-token)
  session.on("assistant.message_delta", onAssistantMessageDelta);

  // Complete assistant message
  session.on("assistant.message", onAssistantMessage);

  // Tool execution lifecycle
  session.on("tool.execution_start", onToolExecutionStart);

  session.on("tool.execution_complete", onToolExecutionComplete);

  // Session idle = generation complete
  session.on("session.idle", onSessionIdle);

  // Session error
  session.on("session.error", onSessionError);

  // Auto-generated title from SDK
  session.on("session.title_changed", onSessionTitleChanged);

  // Sub-agent events (for transparency)
  session.on("subagent.started", onSubagentStarted);

  session.on("subagent.completed", onSubagentCompleted);

  const detach = (
    eventName: string,
    listener: (...args: unknown[]) => void,
  ) => {
    const sdkSession = session as {
      off?: (name: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (
        name: string,
        handler: (...args: unknown[]) => void,
      ) => void;
    };
    if (typeof sdkSession.off === "function") {
      sdkSession.off(eventName, listener);
      return;
    }
    if (typeof sdkSession.removeListener === "function") {
      sdkSession.removeListener(eventName, listener);
    }
  };

  const cleanup = () => {
    detach("assistant.message_delta", onAssistantMessageDelta);
    detach("assistant.message", onAssistantMessage);
    detach("tool.execution_start", onToolExecutionStart);
    detach("tool.execution_complete", onToolExecutionComplete);
    detach("session.idle", onSessionIdle);
    detach("session.error", onSessionError);
    detach("session.title_changed", onSessionTitleChanged);
    detach("subagent.started", onSubagentStarted);
    detach("subagent.completed", onSubagentCompleted);
  };

  return cleanup;
}
