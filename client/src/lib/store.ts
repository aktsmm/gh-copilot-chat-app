/**
 * useChatStore — Lightweight global state for conversations.
 *
 * React 19-friendly: uses useSyncExternalStore under the hood for
 * framework-agnostic state management without extra deps.
 */

import { useSyncExternalStore } from "react";
import type {
  AgentMode,
  ChatMessage,
  Conversation,
  ModelInfoLite,
  PreferredReasoningEffort,
  QuotaSnapshot,
  ReasoningEffort,
  ThemeMode,
  ToolCall,
  ToolInfoLite,
  UiLanguage,
  UiMode,
  UserProfile,
} from "./types";

const SETTINGS_KEY = "ghc-chat-settings-v1";
const DEFAULT_MODELS = [
  "gpt-5",
  "gpt-5.3-codex",
  "gpt-4.1",
  "claude-sonnet-4.6",
] as const;

function shouldHideModel(modelId: string): boolean {
  const normalized = modelId.trim();
  return normalized.length === 0;
}

interface PersistedSettings {
  preferredModel: string;
  preferredAgentMode: AgentMode;
  preferredReasoningEffort: PreferredReasoningEffort;
  uiLanguage: UiLanguage;
  themeMode: ThemeMode;
  uiMode: UiMode;
  userProfile: UserProfile;
  copilotPersona: string;
}

function isUiLanguage(value: unknown): value is UiLanguage {
  return value === "ja" || value === "en";
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function isUiMode(value: unknown): value is UiMode {
  return value === "simple" || value === "advanced";
}

function isAgentMode(value: unknown): value is AgentMode {
  return value === "interactive" || value === "plan" || value === "autopilot";
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  );
}

function isPreferredReasoningEffort(
  value: unknown,
): value is PreferredReasoningEffort {
  return value === "auto" || isReasoningEffort(value);
}

function readSettings(): PersistedSettings {
  const defaults: PersistedSettings = {
    preferredModel: DEFAULT_MODELS[0],
    preferredAgentMode: "interactive",
    preferredReasoningEffort: "auto",
    uiLanguage: "ja",
    themeMode: "dark",
    uiMode: "simple",
    userProfile: {
      displayName: "ユーザー",
      headline: "",
    },
    copilotPersona: "",
  };
  if (typeof window === "undefined") return defaults;

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;

    return {
      preferredModel:
        typeof parsed.preferredModel === "string" && parsed.preferredModel
          ? parsed.preferredModel
          : defaults.preferredModel,
      preferredAgentMode: isAgentMode(parsed.preferredAgentMode)
        ? parsed.preferredAgentMode
        : defaults.preferredAgentMode,
      preferredReasoningEffort: isPreferredReasoningEffort(
        parsed.preferredReasoningEffort,
      )
        ? parsed.preferredReasoningEffort
        : defaults.preferredReasoningEffort,
      uiLanguage: isUiLanguage(parsed.uiLanguage)
        ? parsed.uiLanguage
        : defaults.uiLanguage,
      themeMode: isThemeMode(parsed.themeMode)
        ? parsed.themeMode
        : defaults.themeMode,
      uiMode: isUiMode(parsed.uiMode) ? parsed.uiMode : defaults.uiMode,
      userProfile:
        parsed.userProfile && typeof parsed.userProfile === "object"
          ? {
              displayName:
                typeof parsed.userProfile.displayName === "string" &&
                parsed.userProfile.displayName.trim().length > 0
                  ? parsed.userProfile.displayName.trim()
                  : defaults.userProfile.displayName,
              headline:
                typeof parsed.userProfile.headline === "string"
                  ? parsed.userProfile.headline.trim()
                  : defaults.userProfile.headline,
            }
          : defaults.userProfile,
      copilotPersona:
        typeof parsed.copilotPersona === "string"
          ? parsed.copilotPersona.trim()
          : defaults.copilotPersona,
    };
  } catch {
    return defaults;
  }
}

function persistSettings() {
  if (typeof window === "undefined") return;
  const payload: PersistedSettings = {
    preferredModel: state.preferredModel,
    preferredAgentMode: state.preferredAgentMode,
    preferredReasoningEffort: state.preferredReasoningEffort,
    uiLanguage: state.uiLanguage,
    themeMode: state.themeMode,
    uiMode: state.uiMode,
    userProfile: state.userProfile,
    copilotPersona: state.copilotPersona,
  };
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
  } catch {}
}

function normalizeReasoningPreferenceForModel(modelId: string) {
  if (state.preferredReasoningEffort === "auto") return;
  const model = state.modelCatalog.find((item) => item.id === modelId);
  if (!model?.reasoningSupported) {
    state.preferredReasoningEffort = "auto";
    return;
  }

  const supported = model.supportedReasoningEfforts;
  if (supported && !supported.includes(state.preferredReasoningEffort)) {
    state.preferredReasoningEffort = "auto";
  }
}

function normalizeModels(models: string[]): string[] {
  const normalized = models
    .map((model) => model.trim())
    .filter(Boolean);

  const source = normalized.length > 0 ? normalized : [...DEFAULT_MODELS];
  return [...new Set(source)].filter(
    (model) => !shouldHideModel(model),
  );
}

// ── State ───────────────────────────────────────────────────
interface ChatState {
  conversations: Map<string, Conversation>;
  activeId: string | null;
  /** Session-scoped transient UI state (generation/stream/tools). */
  sessionUi: Map<
    string,
    {
      isGenerating: boolean;
      streamBuffer: string;
      activeTools: ToolCall[];
    }
  >;
  modelCatalog: ModelInfoLite[];
  availableToolsCatalog: ToolInfoLite[];
  quotaSnapshots: Record<string, QuotaSnapshot>;
  availableModels: string[];
  preferredModel: string;
  preferredAgentMode: AgentMode;
  preferredReasoningEffort: PreferredReasoningEffort;
  uiLanguage: UiLanguage;
  themeMode: ThemeMode;
  uiMode: UiMode;
  userProfile: UserProfile;
  copilotPersona: string;
}

const settings = readSettings();

let state: ChatState = {
  conversations: new Map(),
  activeId: null,
  sessionUi: new Map(),
  modelCatalog: [],
  availableToolsCatalog: [],
  quotaSnapshots: {},
  availableModels: normalizeModels([]),
  preferredModel: settings.preferredModel,
  preferredAgentMode: settings.preferredAgentMode,
  preferredReasoningEffort: settings.preferredReasoningEffort,
  uiLanguage: settings.uiLanguage,
  themeMode: settings.themeMode,
  uiMode: settings.uiMode,
  userProfile: settings.userProfile,
  copilotPersona: settings.copilotPersona,
};

if (
  !shouldHideModel(state.preferredModel) &&
  !state.availableModels.includes(state.preferredModel)
) {
  state.availableModels = [state.preferredModel, ...state.availableModels];
}

const listeners = new Set<() => void>();

function emit() {
  // Shallow-clone so useSyncExternalStore sees a new reference
  state = { ...state };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

function getSessionUi(sessionId: string) {
  return (
    state.sessionUi.get(sessionId) ?? {
      isGenerating: false,
      streamBuffer: "",
      activeTools: [],
    }
  );
}

function setSessionUi(
  sessionId: string,
  updater: (current: {
    isGenerating: boolean;
    streamBuffer: string;
    activeTools: ToolCall[];
  }) => {
    isGenerating: boolean;
    streamBuffer: string;
    activeTools: ToolCall[];
  },
) {
  if (!state.conversations.has(sessionId)) return;
  const next = updater(getSessionUi(sessionId));
  state.sessionUi = new Map(state.sessionUi);
  state.sessionUi.set(sessionId, next);
}

// ── Public Actions ──────────────────────────────────────────

export function addConversation(conv: Omit<Conversation, "messages">) {
  state.conversations = new Map(state.conversations);
  state.conversations.set(conv.id, { ...conv, messages: [] });
  if (
    conv.model &&
    !shouldHideModel(conv.model) &&
    !state.availableModels.includes(conv.model)
  ) {
    state.availableModels = [conv.model, ...state.availableModels];
  }
  state.sessionUi = new Map(state.sessionUi);
  state.sessionUi.set(conv.id, {
    isGenerating: false,
    streamBuffer: "",
    activeTools: [],
  });
  state.activeId = conv.id;
  emit();
}

export function addConversationsBulk(
  conversations: Array<Omit<Conversation, "messages">>,
  options?: { preserveActiveId?: string | null },
) {
  if (conversations.length === 0) return;

  let insertedCount = 0;
  let latestInsertedId: string | null = null;

  state.conversations = new Map(state.conversations);
  state.sessionUi = new Map(state.sessionUi);

  for (const conv of conversations) {
    if (state.conversations.has(conv.id)) continue;

    state.conversations.set(conv.id, { ...conv, messages: [] });
    state.sessionUi.set(conv.id, {
      isGenerating: false,
      streamBuffer: "",
      activeTools: [],
    });

    if (
      conv.model &&
      !shouldHideModel(conv.model) &&
      !state.availableModels.includes(conv.model)
    ) {
      state.availableModels = [conv.model, ...state.availableModels];
    }

    insertedCount += 1;
    latestInsertedId = conv.id;
  }

  if (insertedCount === 0) return;

  const preserved = options?.preserveActiveId;
  if (preserved && state.conversations.has(preserved)) {
    state.activeId = preserved;
  } else if (latestInsertedId) {
    state.activeId = latestInsertedId;
  }

  emit();
}

export function upsertConversationsBulk(
  conversations: Array<Omit<Conversation, "messages">>,
  options?: {
    preserveActiveId?: string | null;
    removeMissing?: boolean;
    keepConversationIds?: string[];
  },
) {
  const shouldRemoveMissing = options?.removeMissing === true;
  if (conversations.length === 0 && !shouldRemoveMissing) return;

  let latestInsertedId: string | null = null;
  const incomingIds = new Set(conversations.map((conv) => conv.id));

  state.conversations = new Map(state.conversations);
  state.sessionUi = new Map(state.sessionUi);

  if (shouldRemoveMissing) {
    const keepIds = new Set(options?.keepConversationIds ?? []);
    for (const id of [...state.conversations.keys()]) {
      if (incomingIds.has(id) || keepIds.has(id)) continue;
      state.conversations.delete(id);
      state.sessionUi.delete(id);
    }
  }

  for (const conv of conversations) {
    const existing = state.conversations.get(conv.id);

    if (existing) {
      state.conversations.set(conv.id, {
        ...existing,
        title: conv.title,
        model: conv.model,
        createdAt: conv.createdAt,
        lastUsed: conv.lastUsed,
        mode: conv.mode ?? existing.mode,
        reasoningEffort: conv.reasoningEffort ?? existing.reasoningEffort,
        availableTools: conv.availableTools ?? existing.availableTools,
        excludedTools: conv.excludedTools ?? existing.excludedTools,
        messages: existing.messages,
      });
      if (shouldRemoveMissing) {
        state.sessionUi.set(conv.id, {
          isGenerating: false,
          streamBuffer: "",
          activeTools: [],
        });
      }
    } else {
      state.conversations.set(conv.id, { ...conv, messages: [] });
      state.sessionUi.set(conv.id, {
        isGenerating: false,
        streamBuffer: "",
        activeTools: [],
      });
      latestInsertedId = conv.id;
    }

    if (
      conv.model &&
      !shouldHideModel(conv.model) &&
      !state.availableModels.includes(conv.model)
    ) {
      state.availableModels = [conv.model, ...state.availableModels];
    }
  }

  const preserved = options?.preserveActiveId;
  if (preserved && state.conversations.has(preserved)) {
    state.activeId = preserved;
  } else if (!state.activeId || !state.conversations.has(state.activeId)) {
    if (latestInsertedId) {
      state.activeId = latestInsertedId;
    } else {
      const nextActive = [...state.conversations.values()].sort(
        (a, b) => b.lastUsed - a.lastUsed,
      )[0];
      state.activeId = nextActive?.id ?? null;
    }
  }

  emit();
}

export function setActiveConversation(id: string | null) {
  if (id !== null && !state.conversations.has(id)) return;
  if (state.activeId === id) return;
  state.activeId = id;
  emit();
}

export function hasConversation(id: string): boolean {
  return state.conversations.has(id);
}

export function hasMessageInConversation(
  conversationId: string,
  messageId: string,
): boolean {
  const conv = state.conversations.get(conversationId);
  if (!conv) return false;
  return conv.messages.some((message) => message.id === messageId);
}

export function removeConversation(id: string) {
  state.conversations = new Map(state.conversations);
  state.conversations.delete(id);
  state.sessionUi = new Map(state.sessionUi);
  state.sessionUi.delete(id);
  if (state.activeId === id) {
    const nextActive = [...state.conversations.values()].sort(
      (a, b) => b.lastUsed - a.lastUsed,
    )[0];
    state.activeId = nextActive?.id ?? null;
  }
  emit();
}

export function renameConversation(id: string, title: string) {
  const conv = state.conversations.get(id);
  if (!conv) return;
  state.conversations = new Map(state.conversations);
  state.conversations.set(id, { ...conv, title });
  emit();
}

export function updateConversationRuntime(
  id: string,
  runtime: Partial<
    Pick<
      Conversation,
      "model" | "mode" | "reasoningEffort" | "availableTools" | "excludedTools"
    >
  >,
) {
  const conv = state.conversations.get(id);
  if (!conv) return;
  state.conversations = new Map(state.conversations);
  state.conversations.set(id, {
    ...conv,
    ...runtime,
    lastUsed: Date.now(),
  });
  emit();
}

export function pushMessage(conversationId: string, msg: ChatMessage) {
  const conv = state.conversations.get(conversationId);
  if (!conv) return;
  state.conversations = new Map(state.conversations);
  state.conversations.set(conversationId, {
    ...conv,
    messages: [...conv.messages, msg],
    lastUsed: Date.now(),
  });
  emit();
}

export function setGenerating(conversationId: string, value: boolean) {
  setSessionUi(conversationId, (current) => ({
    ...current,
    isGenerating: value,
    ...(value
      ? {}
      : {
          streamBuffer: "",
          activeTools: [],
        }),
  }));
  emit();
}

export function appendStream(conversationId: string, content: string) {
  setSessionUi(conversationId, (current) => ({
    ...current,
    streamBuffer: current.streamBuffer + content,
  }));
  emit();
}

export function clearStream(conversationId: string) {
  setSessionUi(conversationId, (current) => ({
    ...current,
    streamBuffer: "",
  }));
  emit();
}

export function addActiveTool(
  conversationId: string,
  name: string,
  id?: string,
) {
  setSessionUi(conversationId, (current) => ({
    ...current,
    activeTools: current.activeTools.some((tool) =>
      id
        ? tool.id === id && tool.status === "running"
        : tool.id == null && tool.name === name && tool.status === "running",
    )
      ? current.activeTools
      : [...current.activeTools, { id, name, status: "running" }],
  }));
  emit();
}

export function completeActiveTool(
  conversationId: string,
  toolCallId?: string,
  toolName?: string,
  output?: string,
) {
  const current = getSessionUi(conversationId);
  const index = current.activeTools.findIndex((tool) => {
    if (toolCallId) return tool.id === toolCallId;
    if (!toolName) return false;
    return tool.name === toolName && tool.status === "running";
  });
  if (index < 0) return;

  setSessionUi(conversationId, (ui) => ({
    ...ui,
    activeTools: ui.activeTools.map((tool, i) =>
      i === index ? { ...tool, status: "done" as const, output } : tool,
    ),
  }));
  emit();
}

export function setAvailableModels(models: string[]) {
  state.availableModels = normalizeModels(models);
  if (!state.availableModels.includes(state.preferredModel)) {
    state.preferredModel = state.availableModels[0] ?? DEFAULT_MODELS[0];
  }
  normalizeReasoningPreferenceForModel(state.preferredModel);
  persistSettings();
  emit();
}

export function setModelCatalog(models: ModelInfoLite[]) {
  state.modelCatalog = models;
  state.availableModels = normalizeModels(models.map((model) => model.id));
  if (!state.availableModels.includes(state.preferredModel)) {
    state.preferredModel = state.availableModels[0] ?? DEFAULT_MODELS[0];
  }
  normalizeReasoningPreferenceForModel(state.preferredModel);
  persistSettings();
  emit();
}

export function setAvailableToolsCatalog(tools: ToolInfoLite[]) {
  state.availableToolsCatalog = tools;
  emit();
}

export function setQuotaSnapshots(quota: Record<string, QuotaSnapshot>) {
  state.quotaSnapshots = quota;
  emit();
}

export function setPreferredModel(model: string) {
  const normalized = model.trim();
  if (!normalized) return;
  if (shouldHideModel(normalized)) return;

  if (!state.availableModels.includes(normalized)) {
    state.availableModels = [normalized, ...state.availableModels];
  }
  state.preferredModel = normalized;
  normalizeReasoningPreferenceForModel(state.preferredModel);
  persistSettings();
  emit();
}

export function setPreferredAgentMode(mode: AgentMode) {
  state.preferredAgentMode = mode;
  persistSettings();
  emit();
}

export function setPreferredReasoningEffort(effort: PreferredReasoningEffort) {
  state.preferredReasoningEffort = effort;
  normalizeReasoningPreferenceForModel(state.preferredModel);
  persistSettings();
  emit();
}

export function setUiLanguage(language: UiLanguage) {
  state.uiLanguage = language;
  persistSettings();
  emit();
}

export function setThemeMode(themeMode: ThemeMode) {
  state.themeMode = themeMode;
  persistSettings();
  emit();
}

export function setUiMode(uiMode: UiMode) {
  state.uiMode = uiMode;
  persistSettings();
  emit();
}

export function setUserProfile(profile: UserProfile) {
  const displayName = profile.displayName.trim();
  if (!displayName) return;

  state.userProfile = {
    displayName,
    headline: profile.headline?.trim() ?? "",
  };
  persistSettings();
  emit();
}

export function setCopilotPersona(persona: string) {
  state.copilotPersona = persona.trim();
  persistSettings();
  emit();
}

// ── Hook ────────────────────────────────────────────────────

export function useChatStore() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const active = s.activeId ? (s.conversations.get(s.activeId) ?? null) : null;
  const activeUi = s.activeId
    ? (s.sessionUi.get(s.activeId) ?? {
        isGenerating: false,
        streamBuffer: "",
        activeTools: [],
      })
    : {
        isGenerating: false,
        streamBuffer: "",
        activeTools: [],
      };
  const sortedConversations = [...s.conversations.values()].sort(
    (a, b) => b.lastUsed - a.lastUsed,
  );

  return {
    conversations: sortedConversations,
    active,
    activeId: s.activeId,
    isGenerating: activeUi.isGenerating,
    streamBuffer: activeUi.streamBuffer,
    activeTools: activeUi.activeTools,
    modelCatalog: s.modelCatalog,
    availableToolsCatalog: s.availableToolsCatalog,
    quotaSnapshots: s.quotaSnapshots,
    availableModels: s.availableModels,
    preferredModel: s.preferredModel,
    preferredAgentMode: s.preferredAgentMode,
    preferredReasoningEffort: s.preferredReasoningEffort,
    uiLanguage: s.uiLanguage,
    themeMode: s.themeMode,
    uiMode: s.uiMode,
    userProfile: s.userProfile,
    copilotPersona: s.copilotPersona,
  };
}
