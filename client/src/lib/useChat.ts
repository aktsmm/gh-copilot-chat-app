/**
 * useChat — Core hook that orchestrates Socket.IO events ↔ UI state.
 */

import { useEffect, useCallback, useRef } from "react";
import { getSocket } from "./socket";
import {
  addConversation,
  upsertConversationsBulk,
  setModelCatalog,
  setAvailableToolsCatalog,
  setQuotaSnapshots,
  pushMessage,
  setGenerating,
  appendStream,
  clearStream,
  addActiveTool,
  completeActiveTool,
  setPreferredModel,
  setPreferredAgentMode,
  setPreferredReasoningEffort,
  setUiLanguage,
  setThemeMode,
  setUiMode,
  setUserProfile,
  setCopilotPersona,
  updateConversationRuntime,
  useChatStore,
  setActiveConversation,
  removeConversation,
  renameConversation,
  hasMessageInConversation,
} from "./store";
import type {
  AgentMode,
  ChatMessage,
  ModelInfoLite,
  PreferredReasoningEffort,
  QuotaSnapshot,
  ReasoningEffort,
  SkillTemplate,
  ToolInfoLite,
  UiLanguage,
} from "./types";
import { t } from "./i18n";
import {
  isChatErrorCode,
  type ChatErrorCode,
} from "../../../shared/chat-error-code.js";

const FALLBACK_MODELS = [
  "gpt-5",
  "gpt-5.3-codex",
  "gpt-4.1",
  "claude-sonnet-4.6",
];

const REASONING_EFFORTS: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

type ChatRole = ChatMessage["role"];

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant" || value === "system";
}

function toObject(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  return payload as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeChatRole(value: unknown): ChatRole {
  return isChatRole(value) ? value : "assistant";
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORTS.includes(value as ReasoningEffort);
}

function toFiniteNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "string") {
    const compact = value.trim();
    if (!compact) return undefined;
    const match = /^(?:x\s*)?(\d+(?:\.\d+)?)\s*x?$/i.exec(compact);
    if (!match) return undefined;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return undefined;
  }

  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function isAgentMode(value: unknown): value is AgentMode {
  return value === "interactive" || value === "plan" || value === "autopilot";
}

function normalizeModelCatalog(payload: unknown): ModelInfoLite[] {
  if (!Array.isArray(payload)) {
    return FALLBACK_MODELS.map((id) => ({
      id,
      name: id,
      reasoningSupported: false,
    }));
  }

  const catalog = payload
    .map((item): ModelInfoLite | null => {
      if (typeof item === "string") {
        return { id: item, name: item, reasoningSupported: false };
      }
      if (!item || typeof item !== "object") return null;
      const rawId =
        (item as Record<string, unknown>).id ??
        (item as Record<string, unknown>).name ??
        (item as Record<string, unknown>).model;
      if (typeof rawId !== "string") return null;

      const capabilities = (item as Record<string, unknown>).capabilities as
        | Record<string, unknown>
        | undefined;
      const supports = capabilities?.supports as
        | Record<string, unknown>
        | undefined;
      const supportsReasoning = Boolean(supports?.reasoningEffort);
      const rawSupportedReasoningEfforts = (item as Record<string, unknown>)
        .supportedReasoningEfforts;
      const supportedReasoningEfforts = Array.isArray(
        rawSupportedReasoningEfforts,
      )
        ? rawSupportedReasoningEfforts.filter(
            (effort: unknown): effort is ReasoningEffort =>
              isReasoningEffort(effort),
          )
        : undefined;

      const rawDefaultReasoningEffort = (item as Record<string, unknown>)
        .defaultReasoningEffort;
      const defaultReasoningEffort = isReasoningEffort(
        rawDefaultReasoningEffort,
      )
        ? rawDefaultReasoningEffort
        : undefined;

      const billing = (item as Record<string, unknown>).billing as
        | Record<string, unknown>
        | undefined;
      const rawRateMultiplier =
        (item as Record<string, unknown>).rateMultiplier ??
        (item as Record<string, unknown>).rate_multiplier ??
        (item as Record<string, unknown>).rateLimitMultiplier ??
        (item as Record<string, unknown>).rate_limit_multiplier ??
        (item as Record<string, unknown>).multiplier ??
        (item as Record<string, unknown>).relativeCost ??
        (item as Record<string, unknown>).relative_cost ??
        billing?.rateMultiplier ??
        billing?.rate_multiplier ??
        billing?.multiplier ??
        billing?.relativeCost ??
        billing?.relative_cost;
      const rateMultiplier = toFiniteNonNegativeNumber(rawRateMultiplier);

      return {
        id: rawId,
        name:
          typeof (item as Record<string, unknown>).name === "string"
            ? ((item as Record<string, unknown>).name as string)
            : rawId,
        reasoningSupported: supportsReasoning,
        supportedReasoningEfforts,
        defaultReasoningEffort,
        rateMultiplier,
      };
    })
    .filter((value): value is ModelInfoLite => Boolean(value));

  if (catalog.length === 0) {
    return FALLBACK_MODELS.map((id) => ({
      id,
      name: id,
      reasoningSupported: false,
    }));
  }

  const byId = new Map<string, ModelInfoLite>();
  for (const model of catalog) {
    if (!byId.has(model.id)) {
      byId.set(model.id, model);
    }
  }

  return [...byId.values()];
}

function normalizeTools(payload: unknown): ToolInfoLite[] {
  if (!Array.isArray(payload)) return [];

  const inferCategory = (name: string, namespacedName?: string): string => {
    const source = (namespacedName ?? name).toLowerCase();
    if (source.includes("playwright") || source.includes("browser"))
      return "browser";
    if (
      source.includes("web") ||
      source.includes("fetch") ||
      source.includes("news")
    )
      return "web";
    if (source.includes("search") || source.includes("grep")) return "search";
    if (
      source.includes("file") ||
      source.includes("read") ||
      source.includes("write") ||
      source.includes("edit")
    ) {
      return "filesystem";
    }
    if (
      source.includes("terminal") ||
      source.includes("shell") ||
      source.includes("bash") ||
      source.includes("powershell")
    ) {
      return "shell";
    }
    if (source.includes("agent") || source.includes("subagent")) return "agent";
    if (
      source.includes("mcp") ||
      source.includes("azure") ||
      source.includes("m365")
    )
      return "mcp";
    return "other";
  };

  const tools = payload
    .map((item): ToolInfoLite | null => {
      if (!item || typeof item !== "object") return null;
      const name = (item as Record<string, unknown>).name;
      if (typeof name !== "string" || name.trim().length === 0) return null;

      const namespacedName = (item as Record<string, unknown>).namespacedName;
      const description = (item as Record<string, unknown>).description;
      return {
        name,
        namespacedName:
          typeof namespacedName === "string" ? namespacedName : undefined,
        description: typeof description === "string" ? description : "",
        category: inferCategory(
          name,
          typeof namespacedName === "string" ? namespacedName : undefined,
        ),
      };
    })
    .filter((value): value is ToolInfoLite => Boolean(value));

  const seen = new Set<string>();
  return tools.filter((tool) => {
    const key = tool.namespacedName ?? tool.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQuota(payload: unknown): Record<string, QuotaSnapshot> {
  if (!payload || typeof payload !== "object") return {};

  const snapshots = payload as Record<string, unknown>;
  const result: Record<string, QuotaSnapshot> = {};
  for (const [key, value] of Object.entries(snapshots)) {
    if (!value || typeof value !== "object") continue;
    const snapshot = value as Record<string, unknown>;
    const entitlementRequests = toFiniteNumber(snapshot.entitlementRequests, 0);
    const usedRequests = toFiniteNumber(snapshot.usedRequests, 0);
    const remainingPercentage = toFiniteNumber(snapshot.remainingPercentage, 0);
    const overage = toFiniteNumber(snapshot.overage, 0);
    const overageAllowedWithExhaustedQuota = Boolean(
      snapshot.overageAllowedWithExhaustedQuota,
    );

    result[key] = {
      entitlementRequests,
      usedRequests,
      remainingPercentage,
      overage,
      overageAllowedWithExhaustedQuota,
      resetDate:
        typeof snapshot.resetDate === "string" ? snapshot.resetDate : undefined,
    };
  }

  return result;
}

function normalizeSelectedTools(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function resolveReasoningEffort(
  effort: PreferredReasoningEffort,
): ReasoningEffort | undefined {
  return effort === "auto" ? undefined : effort;
}

function resolveRuntimeLocaleContext(language: UiLanguage): {
  preferredLocale: string;
  locale?: string;
  timeZone?: string;
} {
  const preferredLocale = language === "ja" ? "ja-JP" : "en-US";
  const locale =
    typeof navigator !== "undefined" &&
    typeof navigator.language === "string" &&
    navigator.language.trim().length > 0
      ? navigator.language.trim()
      : undefined;

  let timeZone: string | undefined;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof resolved === "string" && resolved.trim().length > 0) {
      timeZone = resolved.trim();
    }
  } catch {
    // best effort
  }

  return {
    preferredLocale,
    locale,
    timeZone,
  };
}

function normalizeSessionList(payload: unknown) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((entry) => {
      const item = toObject(entry);
      const id = toNonEmptyString(item.id);
      if (!id) return null;

      const mode = isAgentMode(item.mode) ? item.mode : undefined;
      const reasoningEffort = isReasoningEffort(item.reasoningEffort)
        ? item.reasoningEffort
        : undefined;
      const createdAt = toFiniteNumber(item.createdAt, Date.now());
      const lastUsed = toFiniteNumber(item.lastUsed, createdAt);

      return {
        id,
        title: toNonEmptyString(item.title) ?? "New Chat",
        model: toNonEmptyString(item.model) ?? FALLBACK_MODELS[0],
        createdAt,
        lastUsed,
        mode,
        reasoningEffort,
        availableTools: normalizeSelectedTools(item.availableTools),
        excludedTools: normalizeSelectedTools(item.excludedTools),
      };
    })
    .filter((conversation): conversation is NonNullable<typeof conversation> =>
      Boolean(conversation),
    );
}

function buildResearchPrompt(prompt: string, language: "ja" | "en"): string {
  if (language === "ja") {
    return [
      "以下の依頼を Deep Research モードで実行してください。",
      "1) 目的と制約を整理",
      "2) 調査計画を提示",
      "3) 論点ごとに比較検討（根拠・前提を明記）",
      "4) 推奨案と代替案を提示",
      "5) 残リスクと追加調査項目を列挙",
      "出力は簡潔な見出し構成で、結論から先に示してください。",
      "---",
      prompt,
    ].join("\n");
  }

  return [
    "Execute the following request in Deep Research mode:",
    "1) Clarify goals and constraints",
    "2) Present a research plan",
    "3) Compare key options with evidence and assumptions",
    "4) Provide a recommendation and alternatives",
    "5) List remaining risks and follow-up research items",
    "Use concise headings and lead with the conclusion.",
    "---",
    prompt,
  ].join("\n");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildMcpWebSetupPrompt(url: string, language: "ja" | "en"): string {
  if (language === "ja") {
    return [
      `この MCP エンドポイントを最短で接続設定したいです: ${url}`,
      "不足情報だけ先に質問した上で、次を順番に出してください。",
      "1) 最小構成の設定JSON（コピペ可能）",
      "2) 認証ヘッダーが必要な場合の設定例",
      "3) 接続確認手順（成功/失敗の見分け方）",
      "4) 失敗時チェックリスト（3〜5項目）",
      "出力は簡潔に、まず設定JSONを先頭にしてください。",
    ].join("\n");
  }

  return [
    `I want to connect this MCP endpoint as quickly as possible: ${url}`,
    "Ask only missing inputs first, then output in this order:",
    "1) Minimal copy-paste JSON config",
    "2) Auth-header variant if required",
    "3) Connection verification steps (success/failure signals)",
    "4) Short troubleshooting checklist (3-5 items)",
    "Keep it concise and put the config first.",
  ].join("\n");
}

function formatSystemErrorMessage(
  detail: string,
  language: UiLanguage,
  errorCode?: ChatErrorCode,
): string {
  if (errorCode === "CLI_SPAWN_FAILED") {
    return language === "ja"
      ? "Copilot CLI の起動に失敗しました（spawn EINVAL）。1) `where copilot` で実体パスを確認 2) `.cmd` が先に解決される場合はサーバー起動時に `COPILOT_CLI_PATH` へ `.exe` のフルパスを指定 3) `copilot auth login` で再ログイン後に New Chat を再実行してください。"
      : "Failed to start Copilot CLI (spawn EINVAL). 1) Run `where copilot` to confirm the actual path. 2) If `.cmd` is resolved first, set `COPILOT_CLI_PATH` to the full `.exe` path when starting the server. 3) Re-login with `copilot auth login`, then retry New Chat.";
  }

  if (errorCode === "CLI_NOT_FOUND") {
    return language === "ja"
      ? "Copilot CLI が見つかりません。1) `npm i -g @github/copilot` でインストール 2) `where copilot` で実行ファイルを確認 3) 必要なら `COPILOT_CLI_PATH` に `.exe` のフルパスを指定 4) `copilot auth login` 後に New Chat を再実行してください。"
      : "Copilot CLI was not found. 1) Install with `npm i -g @github/copilot`. 2) Verify executable path with `where copilot`. 3) If needed, set `COPILOT_CLI_PATH` to the full `.exe` path. 4) Run `copilot auth login`, then retry New Chat.";
  }

  if (errorCode === "CLI_NOT_CONNECTED") {
    return language === "ja"
      ? "Copilot CLI に接続できていません。`copilot auth login` で再ログインし、改善しない場合は `where copilot` と `COPILOT_CLI_PATH` 設定を確認してから New Chat を再実行してください。"
      : "Copilot CLI is not connected. Re-login using `copilot auth login`. If it still fails, verify `where copilot` and `COPILOT_CLI_PATH`, then retry New Chat.";
  }

  if (errorCode === "AUTH_REQUIRED") {
    return language === "ja"
      ? "Copilot の認証が必要です。ターミナルで `copilot auth login` を実行してください。"
      : "Copilot authentication is required. Run `copilot auth login` in your terminal.";
  }

  if (errorCode === "SESSION_NOT_FOUND") {
    return language === "ja"
      ? "対象セッションが見つかりません。新しいチャットを作成して再実行してください。"
      : "The target session was not found. Create a new chat and retry.";
  }

  if (errorCode === "INVALID_REQUEST") {
    return language === "ja"
      ? "送信内容が不正です。入力内容を確認して再送してください。"
      : "The request is invalid. Check your input and try again.";
  }

  if (errorCode === "FLEET_UNAVAILABLE") {
    return language === "ja"
      ? "選択中のモデルでは Research モードを利用できません。別モデルに切り替えるか、Research をオフにしてください。"
      : "Research mode is unavailable for the selected model. Switch models or disable Research mode.";
  }

  if (errorCode === "FLEET_START_FAILED") {
    return language === "ja"
      ? "Research モードの開始に失敗しました。別モデルへ切り替えるか、通常送信で再試行してください。"
      : "Failed to start Research mode. Switch models or retry with regular send.";
  }

  const normalized = detail.toLowerCase();

  if (normalized.includes("spawn") && normalized.includes("einval")) {
    return language === "ja"
      ? "Copilot CLI の起動に失敗しました（spawn EINVAL）。1) `where copilot` で実体パスを確認 2) `.cmd` が先に解決される場合はサーバー起動時に `COPILOT_CLI_PATH` へ `.exe` のフルパスを指定 3) `copilot auth login` で再ログイン後に New Chat を再実行してください。"
      : "Failed to start Copilot CLI (spawn EINVAL). 1) Run `where copilot` to confirm the actual path. 2) If `.cmd` is resolved first, set `COPILOT_CLI_PATH` to the full `.exe` path when starting the server. 3) Re-login with `copilot auth login`, then retry New Chat.";
  }

  if (normalized.includes("copilot cli not found")) {
    return language === "ja"
      ? "Copilot CLI が見つかりません。1) `npm i -g @github/copilot` でインストール 2) `where copilot` で実行ファイルを確認 3) 必要なら `COPILOT_CLI_PATH` に `.exe` のフルパスを指定 4) `copilot auth login` 後に New Chat を再実行してください。"
      : "Copilot CLI was not found. 1) Install with `npm i -g @github/copilot`. 2) Verify executable path with `where copilot`. 3) If needed, set `COPILOT_CLI_PATH` to the full `.exe` path. 4) Run `copilot auth login`, then retry New Chat.";
  }

  if (normalized.includes("client not connected")) {
    return language === "ja"
      ? "Copilot CLI に接続できていません。`copilot auth login` で再ログインし、改善しない場合は `where copilot` と `COPILOT_CLI_PATH` 設定を確認してから New Chat を再実行してください。"
      : "Copilot CLI is not connected. Re-login using `copilot auth login`. If it still fails, verify `where copilot` and `COPILOT_CLI_PATH`, then retry New Chat.";
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
    return language === "ja"
      ? "Copilot の認証が必要です。ターミナルで `copilot auth login` を実行してください。"
      : "Copilot authentication is required. Run `copilot auth login` in your terminal.";
  }

  return detail;
}

interface CreateChatOptions {
  model?: string;
  mode?: AgentMode;
  reasoningEffort?: PreferredReasoningEffort;
  availableTools?: string[];
  excludedTools?: string[];
  systemMessage?: string;
  title?: string;
  initialPrompt?: string;
  useDeepResearchPrompt?: boolean;
  useFleetResearch?: boolean;
}

interface SendMessageOptions {
  mode?: AgentMode;
  useDeepResearchPrompt?: boolean;
  useFleetResearch?: boolean;
}

type FleetStartAck =
  | {
      ok: true;
      started: true;
    }
  | {
      ok: false;
      error: string;
      errorCode?: ChatErrorCode;
    };

function parseFleetStartAck(
  payload: unknown,
  language: UiLanguage,
): FleetStartAck {
  const response = toObject(payload);
  if (response.ok === true && response.started === true) {
    return { ok: true, started: true };
  }

  return {
    ok: false,
    error:
      toNonEmptyString(response.error) ??
      (language === "ja"
        ? "Research モードの開始に失敗しました"
        : "Failed to start Research mode"),
    errorCode: isChatErrorCode(response.errorCode)
      ? response.errorCode
      : undefined,
  };
}

function buildFleetStartErrorKey(
  sessionId: string,
  errorDetail: string,
  errorCode?: ChatErrorCode,
): string {
  const normalizedDetail = errorDetail
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return `${sessionId}\u0000${errorCode ?? "UNKNOWN"}\u0000${normalizedDetail}`;
}

function buildFleetStartErrorCodeKey(
  sessionId: string,
  errorCode: ChatErrorCode,
): string {
  return `${sessionId}\u0000${errorCode}`;
}

let nextMsgId = 1;
function msgId() {
  return `msg-${Date.now()}-${nextMsgId++}`;
}

export function useChat() {
  const store = useChatStore();
  const socketRef = useRef(getSocket());
  const activeIdRef = useRef<string | null>(store.activeId);
  const activeConversationModelRef = useRef<string | undefined>(
    store.active?.model,
  );
  const languageRef = useRef(store.uiLanguage);
  const preferredModelRef = useRef(store.preferredModel);
  const fleetStartAckErrorDedupeRef = useRef<Map<string, number>>(new Map());
  const systemNoticeIdRef = useRef<string | null>(null);
  const lastSystemErrorRef = useRef<{
    message: string;
    timestamp: number;
    sessionId: string | null;
  } | null>(null);

  useEffect(() => {
    activeIdRef.current = store.activeId;
  }, [store.activeId]);

  useEffect(() => {
    activeConversationModelRef.current = store.active?.model;
  }, [store.active?.model]);

  useEffect(() => {
    languageRef.current = store.uiLanguage;
  }, [store.uiLanguage]);

  useEffect(() => {
    preferredModelRef.current = store.preferredModel;
  }, [store.preferredModel]);

  const markFleetStartAckError = useCallback(
    (sessionId: string, errorDetail: string, errorCode?: ChatErrorCode) => {
      const now = Date.now();
      const dedupeMap = fleetStartAckErrorDedupeRef.current;
      for (const [key, expiresAt] of dedupeMap.entries()) {
        if (expiresAt <= now) {
          dedupeMap.delete(key);
        }
      }
      dedupeMap.set(
        buildFleetStartErrorKey(sessionId, errorDetail, errorCode),
        now + 5000,
      );

      if (errorCode && errorCode !== "UNKNOWN") {
        dedupeMap.set(
          buildFleetStartErrorCodeKey(sessionId, errorCode),
          now + 1000,
        );
      }
    },
    [],
  );

  const consumeFleetStartAckError = useCallback(
    (sessionId: string, errorDetail: string, errorCode?: ChatErrorCode) => {
      const candidateKeys = [
        buildFleetStartErrorKey(sessionId, errorDetail, errorCode),
        ...(errorCode && errorCode !== "UNKNOWN"
          ? [buildFleetStartErrorCodeKey(sessionId, errorCode)]
          : []),
      ];

      const now = Date.now();
      for (const key of candidateKeys) {
        const expiresAt = fleetStartAckErrorDedupeRef.current.get(key);
        if (!expiresAt) continue;
        fleetStartAckErrorDedupeRef.current.delete(key);
        if (expiresAt > now) return true;
      }

      return false;
    },
    [],
  );

  const pushSystemErrorNotice = useCallback(
    (errorDetail: string, sessionId?: string, errorCode?: ChatErrorCode) => {
      const normalizedError = formatSystemErrorMessage(
        errorDetail,
        languageRef.current,
        errorCode,
      );
      const targetSessionId = sessionId ?? activeIdRef.current ?? null;
      const now = Date.now();
      const lastError = lastSystemErrorRef.current;
      if (
        lastError &&
        lastError.message === normalizedError &&
        lastError.sessionId === targetSessionId &&
        now - lastError.timestamp < 1000
      ) {
        return;
      }
      lastSystemErrorRef.current = {
        message: normalizedError,
        timestamp: now,
        sessionId: targetSessionId,
      };
      if (targetSessionId) {
        setGenerating(targetSessionId, false);
        pushMessage(targetSessionId, {
          id: msgId(),
          role: "system",
          content: `${t(languageRef.current, "systemErrorPrefix")}: ${normalizedError}`,
          timestamp: Date.now(),
        });
        return;
      }

      const systemSessionId =
        systemNoticeIdRef.current ??
        `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!systemNoticeIdRef.current) {
        systemNoticeIdRef.current = systemSessionId;
        addConversation({
          id: systemSessionId,
          model: preferredModelRef.current,
          title:
            languageRef.current === "ja" ? "システム通知" : "System Notices",
          createdAt: Date.now(),
          lastUsed: Date.now(),
        });
        setActiveConversation(systemSessionId);
      }

      pushMessage(systemSessionId, {
        id: msgId(),
        role: "system",
        content: `${t(languageRef.current, "systemErrorPrefix")}: ${normalizedError}`,
        timestamp: Date.now(),
      });
    },
    [],
  );

  // ── Wire up Socket.IO event listeners ─────────────────────
  useEffect(() => {
    const s = socketRef.current;

    const requestModels = () => {
      s.emit("models:list", {}, (models: unknown) => {
        const normalized = normalizeModelCatalog(models);
        setModelCatalog(normalized);
      });
    };

    const requestTools = () => {
      const preferredModelCandidate = preferredModelRef.current?.trim();
      const activeModelCandidate = activeConversationModelRef.current?.trim();
      const model =
        activeModelCandidate && activeModelCandidate.length > 0
          ? activeModelCandidate
          : preferredModelCandidate;

      s.emit("tools:list", { model }, (tools: unknown) => {
        setAvailableToolsCatalog(normalizeTools(tools));
      });
    };

    const requestQuota = () => {
      s.emit("account:quota", {}, (quota: unknown) => {
        setQuotaSnapshots(normalizeQuota(quota));
      });
    };

    const requestSessions = () => {
      s.emit("sessions:list", {}, (sessions: unknown) => {
        const normalized = normalizeSessionList(sessions);
        const keepConversationIds = systemNoticeIdRef.current
          ? [systemNoticeIdRef.current]
          : undefined;

        upsertConversationsBulk(normalized, {
          preserveActiveId: activeIdRef.current,
          keepConversationIds,
          removeMissing: true,
        });
      });
    };

    const requestCapabilities = () => {
      requestSessions();
      requestModels();
      requestTools();
      requestQuota();
    };

    const onDelta = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      appendStream(
        sessionId,
        typeof data.content === "string" ? data.content : "",
      );
    };

    const onMessage = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      const incomingMessageId = toNonEmptyString(data.messageId);
      const resolvedMessageId = incomingMessageId ?? msgId();
      if (hasMessageInConversation(sessionId, resolvedMessageId)) {
        return;
      }
      const sourceRaw = toNonEmptyString(data.source);
      const source =
        sourceRaw === "default" || sourceRaw === "web-search-fallback"
          ? sourceRaw
          : undefined;
      const sourceModel = toNonEmptyString(data.sourceModel);
      const msg: ChatMessage = {
        id: resolvedMessageId,
        role: normalizeChatRole(data.role),
        content: typeof data.content === "string" ? data.content : "",
        timestamp: Date.now(),
        source,
        sourceModel,
      };
      pushMessage(sessionId, msg);
      clearStream(sessionId);
    };

    const onIdle = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      setGenerating(sessionId, false);
    };

    const onToolStart = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      const toolName = toNonEmptyString(data.toolName) ?? "unknown_tool";
      const toolCallId = toNonEmptyString(data.toolCallId);
      addActiveTool(sessionId, toolName, toolCallId);
    };

    const onToolDone = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      completeActiveTool(
        sessionId,
        toNonEmptyString(data.toolCallId),
        toNonEmptyString(data.toolName),
        typeof data.output === "string" ? data.output : undefined,
      );
    };

    const onError = (payload: unknown) => {
      const data = toObject(payload);
      console.error("[chat:error]", data);
      const errorCode = isChatErrorCode(data.errorCode)
        ? data.errorCode
        : undefined;
      const errorDetail =
        typeof data.error === "string" && data.error.trim().length > 0
          ? data.error
          : languageRef.current === "ja"
            ? "不明なエラー"
            : "Unknown error";
      const sessionId = toNonEmptyString(data.sessionId);
      if (sessionId) {
        setGenerating(sessionId, false);
        if (consumeFleetStartAckError(sessionId, errorDetail, errorCode)) {
          return;
        }
      }
      pushSystemErrorNotice(errorDetail, sessionId, errorCode);
    };

    const onTitle = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      const title = toNonEmptyString(data.title);
      if (sessionId && title) {
        renameConversation(sessionId, title);
      }
    };

    const onMode = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId || !isAgentMode(data.mode)) return;
      updateConversationRuntime(sessionId, { mode: data.mode });
    };

    const onModel = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      const model = toNonEmptyString(data.model);
      if (!sessionId || !model) return;
      updateConversationRuntime(sessionId, { model });
    };

    const onToolsUpdated = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      updateConversationRuntime(sessionId, {
        availableTools: normalizeSelectedTools(data.availableTools),
        excludedTools: normalizeSelectedTools(data.excludedTools),
      });
    };

    const onCompacted = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      const removed = toFiniteNumber(data.tokensRemoved);
      pushMessage(sessionId, {
        id: msgId(),
        role: "system",
        content:
          languageRef.current === "ja"
            ? `ℹ️ コンテキスト圧縮が完了しました（削減トークン: ${removed}）`
            : `ℹ️ Context compaction completed (tokens removed: ${removed})`,
        timestamp: Date.now(),
      });
    };

    const onFleetStarted = (payload: unknown) => {
      const data = toObject(payload);
      const sessionId = toNonEmptyString(data.sessionId);
      if (!sessionId) return;
      pushMessage(sessionId, {
        id: msgId(),
        role: "system",
        content:
          languageRef.current === "ja"
            ? "🚀 Fleet Research を開始しました"
            : "🚀 Fleet Research started",
        timestamp: Date.now(),
      });
    };

    s.on("chat:delta", onDelta);
    s.on("chat:message", onMessage);
    s.on("chat:idle", onIdle);
    s.on("chat:tool_start", onToolStart);
    s.on("chat:tool_done", onToolDone);
    s.on("chat:error", onError);
    s.on("chat:title", onTitle);
    s.on("chat:mode", onMode);
    s.on("chat:model", onModel);
    s.on("chat:tools_updated", onToolsUpdated);
    s.on("chat:compacted", onCompacted);
    s.on("chat:fleet_started", onFleetStarted);
    s.on("connect", requestCapabilities);

    requestCapabilities();

    return () => {
      s.off("chat:delta", onDelta);
      s.off("chat:message", onMessage);
      s.off("chat:idle", onIdle);
      s.off("chat:tool_start", onToolStart);
      s.off("chat:tool_done", onToolDone);
      s.off("chat:error", onError);
      s.off("chat:title", onTitle);
      s.off("chat:mode", onMode);
      s.off("chat:model", onModel);
      s.off("chat:tools_updated", onToolsUpdated);
      s.off("chat:compacted", onCompacted);
      s.off("chat:fleet_started", onFleetStarted);
      s.off("connect", requestCapabilities);
    };
  }, []);

  useEffect(() => {
    const activeModel = store.active?.model?.trim();
    const model =
      activeModel && activeModel.length > 0
        ? activeModel
        : store.preferredModel;

    socketRef.current.emit("tools:list", { model }, (tools: unknown) => {
      setAvailableToolsCatalog(normalizeTools(tools));
    });
  }, [store.active?.id, store.active?.model, store.preferredModel]);

  // ── Actions ───────────────────────────────────────────────

  const emitFleetStart = useCallback(
    (sessionId: string, prompt: string) => {
      socketRef.current.emit(
        "session:fleet_start",
        { sessionId, prompt },
        (res: unknown) => {
          const response = parseFleetStartAck(res, languageRef.current);
          if (response.ok === false) {
            markFleetStartAckError(
              sessionId,
              response.error,
              response.errorCode,
            );
            const errorDetail = response.error;
            pushSystemErrorNotice(errorDetail, sessionId, response.errorCode);
            return;
          }
        },
      );
    },
    [markFleetStartAckError, pushSystemErrorNotice],
  );

  const createChat = useCallback(
    (opts: CreateChatOptions = {}) => {
      const s = socketRef.current;
      const model = opts.model ?? store.preferredModel;
      const mode = opts.mode ?? store.preferredAgentMode;
      const personaMessage = store.copilotPersona.trim();
      const systemMessage =
        opts.systemMessage ??
        (personaMessage.length > 0 ? personaMessage : undefined);
      const preferredReasoning =
        opts.reasoningEffort ?? store.preferredReasoningEffort;
      const reasoningEffort = resolveReasoningEffort(preferredReasoning);
      s.emit(
        "chat:create",
        {
          model,
          mode,
          reasoningEffort,
          availableTools: opts.availableTools,
          excludedTools: opts.excludedTools,
          systemMessage,
          title: opts.title,
        },
        (res: unknown) => {
          const response = toObject(res);
          if (response.ok === false) {
            const errorCode = isChatErrorCode(response.errorCode)
              ? response.errorCode
              : undefined;
            const errorDetail =
              toNonEmptyString(response.error) ??
              (languageRef.current === "ja"
                ? "セッションの作成に失敗しました"
                : "Failed to create session");
            pushSystemErrorNotice(errorDetail, undefined, errorCode);
            return;
          }

          const sessionId = toNonEmptyString(response.sessionId);
          if (!sessionId) {
            const errorDetail =
              toNonEmptyString(response.error) ??
              (languageRef.current === "ja"
                ? "セッションIDの取得に失敗しました"
                : "Failed to get session ID");
            pushSystemErrorNotice(errorDetail);
            return;
          }

          const userPrompt = opts.initialPrompt?.trim();
          const assistantPrompt =
            userPrompt && opts.useDeepResearchPrompt
              ? buildResearchPrompt(userPrompt, store.uiLanguage)
              : userPrompt;

          addConversation({
            id: sessionId,
            model: typeof response.model === "string" ? response.model : model,
            mode: isAgentMode(response.mode) ? response.mode : mode,
            reasoningEffort: isReasoningEffort(response.reasoningEffort)
              ? response.reasoningEffort
              : reasoningEffort,
            availableTools:
              normalizeSelectedTools(response.availableTools) ??
              normalizeSelectedTools(opts.availableTools),
            excludedTools:
              normalizeSelectedTools(response.excludedTools) ??
              normalizeSelectedTools(opts.excludedTools),
            title:
              toNonEmptyString(response.title) ??
              opts.title ??
              t(store.uiLanguage, "newChat"),
            createdAt:
              typeof response.createdAt === "number"
                ? response.createdAt
                : Date.now(),
            lastUsed: Date.now(),
          });

          if (userPrompt && assistantPrompt) {
            pushMessage(sessionId, {
              id: msgId(),
              role: "user",
              content: userPrompt,
              timestamp: Date.now(),
            });
            setGenerating(sessionId, true);
            clearStream(sessionId);
            const shouldStartFleet =
              opts.useFleetResearch ?? opts.useDeepResearchPrompt;
            if (shouldStartFleet) {
              emitFleetStart(sessionId, assistantPrompt);
              return;
            }
            const localeContext = resolveRuntimeLocaleContext(store.uiLanguage);
            s.emit("chat:send", {
              sessionId,
              prompt: assistantPrompt,
              mode,
              preferredLocale: localeContext.preferredLocale,
              locale: localeContext.locale,
              timeZone: localeContext.timeZone,
            });
          }
        },
      );
    },
    [
      pushSystemErrorNotice,
      store.preferredAgentMode,
      store.copilotPersona,
      store.preferredModel,
      store.preferredReasoningEffort,
      store.uiLanguage,
      emitFleetStart,
    ],
  );

  const sendMessage = useCallback(
    (prompt: string, options?: SendMessageOptions) => {
      const id = store.activeId;
      if (!id || !prompt.trim()) return;
      const mode = options?.mode ?? store.preferredAgentMode;

      const runtimePrompt = options?.useDeepResearchPrompt
        ? buildResearchPrompt(prompt, store.uiLanguage)
        : prompt;

      // Optimistic user message
      pushMessage(id, {
        id: msgId(),
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      });

      setGenerating(id, true);
      clearStream(id);
      updateConversationRuntime(id, { mode });

      const shouldStartFleet =
        options?.useFleetResearch ?? options?.useDeepResearchPrompt;
      if (shouldStartFleet) {
        emitFleetStart(id, runtimePrompt);
        return;
      }

      const localeContext = resolveRuntimeLocaleContext(store.uiLanguage);

      socketRef.current.emit("chat:send", {
        sessionId: id,
        prompt: runtimePrompt,
        mode,
        preferredLocale: localeContext.preferredLocale,
        locale: localeContext.locale,
        timeZone: localeContext.timeZone,
      });
    },
    [
      store.activeId,
      store.preferredAgentMode,
      store.uiLanguage,
      emitFleetStart,
    ],
  );

  const abortGeneration = useCallback(() => {
    if (store.activeId) {
      socketRef.current.emit("chat:abort", { sessionId: store.activeId });
      setGenerating(store.activeId, false);
    }
  }, [store.activeId]);

  const deleteChat = useCallback(
    (id: string) => {
      socketRef.current.emit(
        "session:delete",
        { sessionId: id },
        (res: { ok?: boolean } | undefined) => {
          if (res?.ok) {
            removeConversation(id);
            return;
          }

          const noticeSessionId =
            store.activeId && store.activeId !== id ? store.activeId : id;
          const hasNoticeTarget = store.conversations.some(
            (conversation) => conversation.id === noticeSessionId,
          );
          if (!hasNoticeTarget) return;

          pushMessage(noticeSessionId, {
            id: msgId(),
            role: "system",
            content:
              store.uiLanguage === "ja"
                ? `${t(store.uiLanguage, "systemErrorPrefix")}: セッションの削除に失敗しました`
                : `${t(store.uiLanguage, "systemErrorPrefix")}: Failed to delete session`,
            timestamp: Date.now(),
          });
        },
      );
    },
    [store.activeId, store.conversations, store.uiLanguage],
  );

  const renameChat = useCallback(
    (id: string, title: string) => {
      socketRef.current.emit(
        "session:rename",
        { sessionId: id, title },
        (res: { ok?: boolean } | undefined) => {
          if (res?.ok) {
            renameConversation(id, title);
            return;
          }

          const noticeSessionId = store.activeId ?? id;
          const hasNoticeTarget = store.conversations.some(
            (conversation) => conversation.id === noticeSessionId,
          );
          if (!hasNoticeTarget) return;

          pushMessage(noticeSessionId, {
            id: msgId(),
            role: "system",
            content:
              store.uiLanguage === "ja"
                ? `${t(store.uiLanguage, "systemErrorPrefix")}: セッション名の変更に失敗しました`
                : `${t(store.uiLanguage, "systemErrorPrefix")}: Failed to rename session`,
            timestamp: Date.now(),
          });
        },
      );
    },
    [store.activeId, store.conversations, store.uiLanguage],
  );

  const switchChat = useCallback((id: string) => {
    setActiveConversation(id);
  }, []);

  const setConversationMode = useCallback(
    (sessionId: string, mode: AgentMode) => {
      socketRef.current.emit(
        "session:mode",
        { sessionId, mode },
        (
          res: { ok?: boolean; mode?: AgentMode; error?: string } | undefined,
        ) => {
          if (res?.ok && res.mode && isAgentMode(res.mode)) {
            updateConversationRuntime(sessionId, { mode: res.mode });
            return;
          }
        },
      );
    },
    [],
  );

  const setConversationModel = useCallback(
    (sessionId: string, model: string) => {
      const normalized = model.trim();
      if (!normalized) return;

      socketRef.current.emit(
        "session:model",
        { sessionId, model: normalized },
        (res: { ok?: boolean; model?: string; error?: string } | undefined) => {
          if (res?.ok && typeof res.model === "string" && res.model.trim()) {
            updateConversationRuntime(sessionId, { model: res.model.trim() });
            return;
          }
        },
      );
    },
    [],
  );

  const compactActiveSession = useCallback(() => {
    if (!store.activeId) return;
    socketRef.current.emit("session:compact", { sessionId: store.activeId });
  }, [store.activeId]);

  const setConversationToolPolicy = useCallback(
    (
      sessionId: string,
      policy: {
        availableTools?: string[];
        excludedTools?: string[];
      },
    ) => {
      const availableTools = normalizeSelectedTools(policy.availableTools);
      const excludedTools = normalizeSelectedTools(policy.excludedTools);

      socketRef.current.emit(
        "session:tools",
        {
          sessionId,
          availableTools,
          excludedTools,
        },
        (
          res:
            | {
                ok?: boolean;
                availableTools?: string[];
                excludedTools?: string[];
                error?: string;
              }
            | undefined,
        ) => {
          if (res?.ok) {
            updateConversationRuntime(sessionId, {
              availableTools: normalizeSelectedTools(res.availableTools),
              excludedTools: normalizeSelectedTools(res.excludedTools),
            });
            return;
          }
        },
      );
    },
    [],
  );

  const runSkill = useCallback(
    (skill: SkillTemplate) => {
      const deepResearch = skill.id === "deep-research";
      if (skill.recommendedModel) {
        setPreferredModel(skill.recommendedModel);
      }
      createChat({
        model: skill.recommendedModel ?? store.preferredModel,
        mode: deepResearch ? "autopilot" : store.preferredAgentMode,
        title: skill.title,
        initialPrompt: skill.prompt,
        useDeepResearchPrompt: deepResearch,
        useFleetResearch: deepResearch,
      });
    },
    [createChat, store.preferredAgentMode, store.preferredModel],
  );

  const quickConnectMcpByUrl = useCallback(
    (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;

      if (!isHttpUrl(url)) {
        pushSystemErrorNotice(
          store.uiLanguage === "ja"
            ? "有効な MCP URL（http/https）を入力してください"
            : "Please enter a valid MCP URL (http/https)",
          store.activeId ?? undefined,
        );
        return;
      }

      createChat({
        model: store.preferredModel,
        mode: "plan",
        title:
          store.uiLanguage === "ja"
            ? "MCP プロンプト支援"
            : "MCP Prompt Assist",
        initialPrompt: buildMcpWebSetupPrompt(url, store.uiLanguage),
      });
    },
    [
      createChat,
      pushSystemErrorNotice,
      store.activeId,
      store.preferredModel,
      store.uiLanguage,
    ],
  );

  return {
    ...store,
    createChat,
    sendMessage,
    abortGeneration,
    deleteChat,
    renameChat,
    switchChat,
    setConversationMode,
    setConversationModel,
    setConversationToolPolicy,
    compactActiveSession,
    runSkill,
    quickConnectMcpByUrl,
    setPreferredModel,
    setPreferredAgentMode,
    setPreferredReasoningEffort,
    setUiLanguage,
    setThemeMode,
    setUiMode,
    setUserProfile,
    setCopilotPersona,
  };
}
