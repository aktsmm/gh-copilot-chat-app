/**
 * SessionManager — Manages multiple CopilotSession instances.
 *
 * Maps conversation IDs to SDK sessions, handles creation / resumption / cleanup.
 */

import {
  type CopilotClient,
  type CopilotSession,
  approveAll,
  type PermissionHandler,
  type SessionConfig,
  type ResumeSessionConfig,
} from "@github/copilot-sdk";
import { v4 as uuid } from "uuid";
import { buildProviderConfig } from "./client-manager.js";
import { config } from "../config.js";

export type AgentMode = "interactive" | "plan" | "autopilot";
export type SessionReasoningEffort = "low" | "medium" | "high" | "xhigh";

interface CreateSessionOptions {
  model?: string;
  systemMessage?: string;
  title?: string;
  reasoningEffort?: SessionReasoningEffort;
  mode?: AgentMode;
  availableTools?: string[];
  excludedTools?: string[];
}

interface ReconfigureSessionOptions {
  model?: string;
  availableTools?: string[];
  excludedTools?: string[];
}

export interface SessionEntry {
  id: string;
  session: CopilotSession;
  model: string;
  createdAt: number;
  lastUsed: number;
  title: string;
  mode: AgentMode;
  reasoningEffort?: SessionReasoningEffort;
  availableTools?: string[];
  excludedTools?: string[];
}

const sessions = new Map<string, SessionEntry>();

const permissionHandler: PermissionHandler = (() => {
  if (!config.security.strictToolPermissions) {
    return approveAll;
  }

  const allowedKinds = new Set(config.security.allowedPermissionKinds);

  return (request) => {
    const kind = typeof request?.kind === "string" ? request.kind : "unknown";

    if (
      allowedKinds.has(
        kind as (typeof config.security.allowedPermissionKinds)[number],
      )
    ) {
      return { kind: "approved" };
    }

    return {
      kind: "denied-by-rules",
      rules: [
        {
          policy: "strict-tool-permissions",
          reason: `Permission kind '${kind}' is not allowed`,
          allowedKinds: Array.from(allowedKinds),
        },
      ],
    };
  };
})();

export async function createSession(
  client: CopilotClient,
  opts: CreateSessionOptions = {},
): Promise<SessionEntry> {
  const id = uuid();
  const model = opts.model ?? "gpt-4.1";

  const sessionConfig: SessionConfig = {
    model,
    streaming: true,
    sessionId: id,
    onPermissionRequest: permissionHandler,
    clientName: "copilot-chat-gui",
  };

  if (opts.reasoningEffort) {
    sessionConfig.reasoningEffort = opts.reasoningEffort;
  }

  if (Array.isArray(opts.availableTools) && opts.availableTools.length > 0) {
    sessionConfig.availableTools = opts.availableTools;
  }

  if (Array.isArray(opts.excludedTools) && opts.excludedTools.length > 0) {
    sessionConfig.excludedTools = opts.excludedTools;
  }

  if (opts.systemMessage) {
    sessionConfig.systemMessage = {
      mode: "append",
      content: opts.systemMessage,
    };
  }

  const provider = buildProviderConfig();
  if (provider) sessionConfig.provider = provider;

  const session = await client.createSession(sessionConfig);

  const entry: SessionEntry = {
    id: session.sessionId,
    session,
    model,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    title: opts.title ?? "New Chat",
    mode: opts.mode ?? "interactive",
    reasoningEffort: opts.reasoningEffort,
    availableTools:
      Array.isArray(opts.availableTools) && opts.availableTools.length > 0
        ? [...opts.availableTools]
        : undefined,
    excludedTools:
      Array.isArray(opts.excludedTools) && opts.excludedTools.length > 0
        ? [...opts.excludedTools]
        : undefined,
  };

  if (opts.mode) {
    try {
      const switched = await session.rpc.mode.set({ mode: opts.mode });
      entry.mode = switched.mode;
    } catch (err) {
      console.warn("[session] Failed to set initial mode:", err);
    }
  }

  sessions.set(entry.id, entry);
  return entry;
}

export async function resumeSession(
  client: CopilotClient,
  sessionId: string,
): Promise<SessionEntry | null> {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  try {
    const resumeConfig: ResumeSessionConfig = {
      streaming: true,
      onPermissionRequest: permissionHandler,
    };
    const provider = buildProviderConfig();
    if (provider) resumeConfig.provider = provider;

    const session = await client.resumeSession(sessionId, resumeConfig);
    const entry: SessionEntry = {
      id: session.sessionId,
      session,
      model: "unknown",
      createdAt: Date.now(),
      lastUsed: Date.now(),
      title: "Resumed Chat",
      mode: "interactive",
    };
    sessions.set(session.sessionId, entry);
    return entry;
  } catch (err) {
    console.warn("[session] Failed to resume:", err);
    return null;
  }
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}

export function listSessions(): Omit<SessionEntry, "session">[] {
  return [...sessions.values()].map(({ session: _, ...rest }) => rest);
}

export async function deleteSession(
  client: CopilotClient,
  sessionId: string,
): Promise<boolean> {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  try {
    await entry.session.destroy();
  } catch {
    /* best-effort */
  }
  try {
    await client.deleteSession(sessionId);
  } catch {
    /* session may already be deleted on CLI side */
  }
  sessions.delete(sessionId);
  return true;
}

export function updateSessionTitle(sessionId: string, title: string): boolean {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.title = title;
  return true;
}

export function updateSessionMode(sessionId: string, mode: AgentMode): boolean {
  const entry = sessions.get(sessionId);
  if (!entry) return false;
  entry.mode = mode;
  return true;
}

export async function reconfigureSessionTools(
  client: CopilotClient,
  sessionId: string,
  opts: ReconfigureSessionOptions,
): Promise<SessionEntry | null> {
  const entry = sessions.get(sessionId);
  if (!entry) return null;

  const nextModel =
    typeof opts.model === "string" && opts.model.trim().length > 0
      ? opts.model.trim()
      : entry.model;

  const availableTools =
    Array.isArray(opts.availableTools) && opts.availableTools.length > 0
      ? [...opts.availableTools]
      : undefined;
  const excludedTools =
    Array.isArray(opts.excludedTools) && opts.excludedTools.length > 0
      ? [...opts.excludedTools]
      : undefined;

  const resumeConfig: ResumeSessionConfig = {
    streaming: true,
    onPermissionRequest: permissionHandler,
    model: nextModel,
    reasoningEffort: entry.reasoningEffort,
    availableTools,
    excludedTools,
  };

  const provider = buildProviderConfig();
  if (provider) resumeConfig.provider = provider;

  const resumed = await client.resumeSession(sessionId, resumeConfig);
  entry.session = resumed;
  entry.model = nextModel;
  entry.availableTools = availableTools;
  entry.excludedTools = excludedTools;
  entry.lastUsed = Date.now();

  return entry;
}
