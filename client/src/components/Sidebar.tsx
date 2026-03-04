/**
 * Sidebar — Conversation list + New Chat button.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Search,
  Wrench,
  Moon,
  Sun,
  Minimize2,
  ChevronDown,
  Copy,
} from "lucide-react";
import { setUiMode } from "../lib/store";
import type {
  AgentMode,
  Conversation,
  ModelInfoLite,
  PreferredReasoningEffort,
  ReasoningEffort,
  SkillTemplate,
  ThemeMode,
  UiLanguage,
  UserProfile,
} from "../lib/types";
import { t } from "../lib/i18n";
import {
  APP_REPOSITORY_URL,
  APP_SIGNATURE,
  APP_VERSION,
} from "../lib/app-meta";

const CUSTOM_TEMPLATES_KEY = "ghc-custom-templates-v1";
const OUTPUT_DIR_KEY = "ghc-output-dir-v1";
const TEMPLATE_COLLAPSED_KEY = "ghc-templates-collapsed-v1";
const WORKSPACE_COLLAPSED_KEY = "ghc-workspace-collapsed-v1";
const CUSTOM_TEMPLATE_PREFIX = "custom-template-";

function formatRateMultiplier(multiplier: number): string {
  const rounded = Number(multiplier.toFixed(2));
  return `${rounded}x`;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  availableModels: string[];
  modelCatalog: ModelInfoLite[];
  preferredModel: string;
  onPreferredModelChange: (model: string) => void;
  preferredAgentMode: AgentMode;
  onPreferredAgentModeChange: (mode: AgentMode) => void;
  preferredReasoningEffort: PreferredReasoningEffort;
  onPreferredReasoningEffortChange: (effort: PreferredReasoningEffort) => void;
  reasoningOptions: ReasoningEffort[];
  reasoningEnabled: boolean;
  toolsCount: number;
  quotaRemainingPercent: number | null;
  quotaUsageRatePercent: number | null;
  quotaUsageRatio: string | null;
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
  userProfile: UserProfile;
  onUserProfileChange: (profile: UserProfile) => void;
  copilotPersona: string;
  onCopilotPersonaChange: (persona: string) => void;
  skills: SkillTemplate[];
  onRunSkill: (skill: SkillTemplate) => void;
  onQuickMcpByUrl: (url: string) => void;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  availableModels,
  modelCatalog,
  preferredModel,
  onPreferredModelChange,
  preferredAgentMode,
  onPreferredAgentModeChange,
  preferredReasoningEffort,
  onPreferredReasoningEffortChange,
  reasoningOptions,
  reasoningEnabled,
  toolsCount,
  quotaRemainingPercent,
  quotaUsageRatePercent,
  quotaUsageRatio,
  language,
  onLanguageChange,
  themeMode,
  onThemeModeChange,
  userProfile,
  onUserProfileChange,
  copilotPersona,
  onCopilotPersonaChange,
  skills,
  onRunSkill,
  onQuickMcpByUrl,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [customTemplates, setCustomTemplates] = useState<SkillTemplate[]>([]);
  const [templatesCollapsed, setTemplatesCollapsed] = useState(true);
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templatePrompt, setTemplatePrompt] = useState("");
  const [defaultWorkspace, setDefaultWorkspace] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [outputDirSaved, setOutputDirSaved] = useState(false);
  const [workspaceCopied, setWorkspaceCopied] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(
    userProfile.displayName,
  );
  const [draftHeadline, setDraftHeadline] = useState(
    userProfile.headline ?? "",
  );
  const [draftCopilotPersona, setDraftCopilotPersona] =
    useState(copilotPersona);
  const [personaPreset, setPersonaPreset] = useState<
    "custom" | "implementation" | "review" | "research"
  >("custom");
  const conversationButtonRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  useEffect(() => {
    setDraftDisplayName(userProfile.displayName);
    setDraftHeadline(userProfile.headline ?? "");
  }, [userProfile.displayName, userProfile.headline]);

  useEffect(() => {
    setDraftCopilotPersona(copilotPersona);
  }, [copilotPersona]);

  const filteredConversations = conversations.filter((conversation) =>
    conversation.title.toLowerCase().includes(conversationQuery.toLowerCase()),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawTemplates = window.localStorage.getItem(CUSTOM_TEMPLATES_KEY);
      if (rawTemplates) {
        const parsed = JSON.parse(rawTemplates) as SkillTemplate[];
        if (Array.isArray(parsed)) {
          setCustomTemplates(
            parsed.filter(
              (item): item is SkillTemplate =>
                Boolean(item) &&
                typeof item.id === "string" &&
                typeof item.title === "string" &&
                typeof item.description === "string" &&
                typeof item.prompt === "string",
            ),
          );
        }
      }
    } catch {}

    const output = window.localStorage.getItem(OUTPUT_DIR_KEY);
    if (output) {
      setOutputDir(output);
    }

    setTemplatesCollapsed(
      window.localStorage.getItem(TEMPLATE_COLLAPSED_KEY) === "true",
    );
    setWorkspaceCollapsed(
      window.localStorage.getItem(WORKSPACE_COLLAPSED_KEY) === "true",
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        CUSTOM_TEMPLATES_KEY,
        JSON.stringify(customTemplates),
      );
    } catch {}
  }, [customTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      TEMPLATE_COLLAPSED_KEY,
      String(templatesCollapsed),
    );
  }, [templatesCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORKSPACE_COLLAPSED_KEY,
      String(workspaceCollapsed),
    );
  }, [workspaceCollapsed]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        const response = await fetch("/api/workspace");
        if (!response.ok) return;

        const payload = (await response.json()) as {
          workspace?: unknown;
          outputDir?: unknown;
        };

        if (cancelled) return;

        const workspaceValue =
          typeof payload.workspace === "string" ? payload.workspace : "";
        const outputValue =
          typeof payload.outputDir === "string" ? payload.outputDir : "";

        setDefaultWorkspace(workspaceValue);
        setOutputDir((current) => current || outputValue);
      } catch {}
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const combinedTemplates = [...skills, ...customTemplates];

  const filteredSkills = combinedTemplates.filter((skill) => {
    const haystack = `${skill.title} ${skill.description}`.toLowerCase();
    return haystack.includes(skillQuery.toLowerCase());
  });

  const reasoningOptionsUnique = Array.from(new Set(reasoningOptions));
  const modelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of modelCatalog) {
      map.set(model.id, model.name || model.id);
    }
    return map;
  }, [modelCatalog]);
  const modelRateMultiplierById = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of modelCatalog) {
      if (model.rateMultiplier == null) continue;
      map.set(model.id, formatRateMultiplier(model.rateMultiplier));
    }
    return map;
  }, [modelCatalog]);
  const selectedModelRateLabel = modelRateMultiplierById.get(preferredModel);
  const hasRepositoryUrl = APP_REPOSITORY_URL.trim().length > 0;
  const personaPresetText = useMemo(
    () => ({
      implementation:
        language === "ja"
          ? "あなたは実装支援に特化した GitHub Copilot です。最初に結論、次に最小差分の実装手順、最後に検証コマンドを簡潔に示してください。"
          : "You are GitHub Copilot focused on implementation support. Respond with conclusion first, then minimal-diff implementation steps, then concise validation commands.",
      review:
        language === "ja"
          ? "あなたはコードレビューに特化した GitHub Copilot です。重大度順に問題点、根拠、修正案を提示し、最後にリスクを短く要約してください。"
          : "You are GitHub Copilot focused on code review. Provide findings by severity with evidence and fixes, then end with a short risk summary.",
      research:
        language === "ja"
          ? "あなたは調査に特化した GitHub Copilot です。要件整理→調査観点→比較→推奨案→残課題の順で、根拠を明示して回答してください。"
          : "You are GitHub Copilot focused on research. Structure responses as requirements, research angles, comparison, recommendation, and open issues with clear evidence.",
    }),
    [language],
  );

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const restoreConversationFocus = (conversationId: string | null) => {
    if (!conversationId) return;
    setTimeout(() => {
      conversationButtonRefs.current[conversationId]?.focus();
    }, 0);
  };

  const cancelRename = () => {
    const currentEditingId = editingId;
    setEditingId(null);
    restoreConversationFocus(currentEditingId);
  };

  const commitRename = () => {
    const currentEditingId = editingId;
    if (currentEditingId && editTitle.trim()) {
      onRename(currentEditingId, editTitle.trim());
    }
    setEditingId(null);
    restoreConversationFocus(currentEditingId);
  };

  const commitProfile = () => {
    const displayName = draftDisplayName.trim();
    if (!displayName) return;
    onUserProfileChange({
      displayName,
      headline: draftHeadline.trim(),
    });
    onCopilotPersonaChange(draftCopilotPersona);
    setPersonaPreset("custom");
    setEditingProfile(false);
  };

  const applyPersonaPreset = (
    preset: "custom" | "implementation" | "review" | "research",
  ) => {
    setPersonaPreset(preset);
    if (preset === "custom") return;
    setDraftCopilotPersona(personaPresetText[preset]);
  };

  const addTemplate = () => {
    const title = templateTitle.trim();
    const prompt = templatePrompt.trim();
    if (!title || !prompt) return;

    setCustomTemplates((current) => [
      {
        id: `${CUSTOM_TEMPLATE_PREFIX}${Date.now()}`,
        title,
        description: templateDescription.trim(),
        prompt,
      },
      ...current,
    ]);

    setTemplateTitle("");
    setTemplateDescription("");
    setTemplatePrompt("");
    setAddingTemplate(false);
    setTemplatesCollapsed(false);
  };

  const removeTemplate = (id: string) => {
    setCustomTemplates((current) => current.filter((skill) => skill.id !== id));
  };

  const saveOutputDir = () => {
    const normalized = outputDir.trim();
    if (!normalized) return;
    setOutputDir(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(OUTPUT_DIR_KEY, normalized);
    }
    setOutputDirSaved(true);
    setTimeout(() => setOutputDirSaved(false), 1400);
  };

  const copyWorkspace = async () => {
    if (!defaultWorkspace) return;
    try {
      await navigator.clipboard.writeText(defaultWorkspace);
      setWorkspaceCopied(true);
      setTimeout(() => setWorkspaceCopied(false), 1200);
    } catch {}
  };

  return (
    <aside
      className={`flex flex-col overflow-y-auto bg-surface-dark-1 border-r border-surface-dark-3 transition-all duration-200
        ${collapsed ? "w-16" : "w-72"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-surface-dark-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <span className="font-semibold text-sm text-gray-200">
              {t(language, "appTitle")}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={
            collapsed
              ? t(language, "expandSidebar")
              : t(language, "collapseSidebar")
          }
          className="p-1.5 rounded-lg hover:bg-surface-dark-3 text-gray-400 hover:text-gray-200 transition-colors"
          title={
            collapsed
              ? t(language, "expandSidebar")
              : t(language, "collapseSidebar")
          }
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New Chat button */}
      <div className="p-2">
        <button
          data-action="new-chat"
          type="button"
          onClick={onCreate}
          aria-label={t(language, "newChat")}
          className={`flex items-center gap-2 w-full rounded-xl border border-dashed border-surface-dark-4
            hover:border-brand-500/50 hover:bg-surface-dark-2 transition-all text-gray-300 hover:text-white
            ${collapsed ? "justify-center p-2.5" : "px-3 py-2.5"}`}
          title={t(language, "newChat")}
        >
          <Plus className="w-4 h-4 flex-shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium">
              {t(language, "newChat")}
            </span>
          )}
        </button>
      </div>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-2">
          <div className="border border-surface-dark-3 rounded-xl bg-surface-dark-2/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-brand-700/40 border border-brand-500/40 text-brand-200 flex items-center justify-center text-xs font-semibold">
                  {(
                    userProfile.displayName.trim().charAt(0) || "U"
                  ).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-gray-200 truncate">
                    {userProfile.displayName}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {userProfile.headline || t(language, "profile")}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile((prev) => !prev)}
                className="text-[10px] px-2 py-1 rounded-md bg-surface-dark-2 border border-surface-dark-3 text-gray-300 hover:bg-surface-dark-3"
              >
                {t(language, "editProfile")}
              </button>
            </div>

            {editingProfile && (
              <div className="space-y-1.5 pt-1">
                <input
                  value={draftDisplayName}
                  onChange={(e) => setDraftDisplayName(e.target.value)}
                  placeholder={t(language, "profileDisplayNamePlaceholder")}
                  aria-label={t(language, "profileDisplayName")}
                  className="w-full bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <input
                  value={draftHeadline}
                  onChange={(e) => setDraftHeadline(e.target.value)}
                  placeholder={t(language, "profileHeadlinePlaceholder")}
                  aria-label={t(language, "profileHeadline")}
                  className="w-full bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="text-[10px] text-gray-500 px-0.5">
                  {t(language, "copilotPersona")}
                </div>
                <select
                  value={personaPreset}
                  onChange={(e) =>
                    applyPersonaPreset(
                      e.target.value as
                        | "custom"
                        | "implementation"
                        | "review"
                        | "research",
                    )
                  }
                  aria-label={t(language, "personaPreset")}
                  className="w-full bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="custom">
                    {t(language, "personaPresetCustom")}
                  </option>
                  <option value="implementation">
                    {t(language, "personaPresetImplementation")}
                  </option>
                  <option value="review">
                    {t(language, "personaPresetReview")}
                  </option>
                  <option value="research">
                    {t(language, "personaPresetResearch")}
                  </option>
                </select>
                <textarea
                  value={draftCopilotPersona}
                  onChange={(e) => setDraftCopilotPersona(e.target.value)}
                  placeholder={t(language, "copilotPersonaPlaceholder")}
                  aria-label={t(language, "copilotPersona")}
                  rows={3}
                  className="w-full resize-y bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftDisplayName(userProfile.displayName);
                      setDraftHeadline(userProfile.headline ?? "");
                      setDraftCopilotPersona(copilotPersona);
                      setPersonaPreset("custom");
                      setEditingProfile(false);
                    }}
                    className="text-[10px] px-2 py-1 rounded-md bg-surface-dark-2 border border-surface-dark-3 text-gray-300 hover:bg-surface-dark-3"
                  >
                    {t(language, "cancelProfile")}
                  </button>
                  <button
                    type="button"
                    onClick={commitProfile}
                    disabled={draftDisplayName.trim().length === 0}
                    className="text-[10px] px-2 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t(language, "saveProfile")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="sidebar-model-selector"
              className="block text-[10px] text-gray-500 px-1 pb-1"
            >
              {t(language, "modelSelector")}
            </label>
            <select
              id="sidebar-model-selector"
              value={preferredModel}
              onChange={(e) => onPreferredModelChange(e.target.value)}
              title={t(language, "modelSelector")}
              aria-label={t(language, "modelSelector")}
              className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {availableModels.map((model) => (
                <option key={model} value={model}>
                  {modelNameById.get(model) ?? model}
                  {(() => {
                    const rateLabel = modelRateMultiplierById.get(model);
                    return rateLabel ? ` (${rateLabel})` : "";
                  })()}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-gray-500 mt-1 px-1">
              {t(language, "quotaUsageRate")}:{" "}
              {quotaUsageRatePercent == null
                ? "—"
                : `${quotaUsageRatePercent}%`}
              {quotaUsageRatio ? ` (${quotaUsageRatio})` : ""}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 px-1">
              {t(language, "modelRateMultiplier")}:{" "}
              {selectedModelRateLabel ?? "—"}
            </div>
          </div>

          <div>
            <label
              htmlFor="sidebar-agent-mode-selector"
              className="block text-[10px] text-gray-500 px-1 pb-1"
            >
              {t(language, "agentMode")}
            </label>
            <select
              id="sidebar-agent-mode-selector"
              value={preferredAgentMode}
              onChange={(e) =>
                onPreferredAgentModeChange(e.target.value as AgentMode)
              }
              title={t(language, "agentMode")}
              aria-label={t(language, "agentMode")}
              className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="interactive">
                {t(language, "modeInteractive")}
              </option>
              <option value="plan">{t(language, "modePlan")}</option>
              <option value="autopilot">{t(language, "modeAutopilot")}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="sidebar-reasoning-effort-selector"
              className="block text-[10px] text-gray-500 px-1 pb-1"
            >
              {t(language, "reasoningEffort")}
            </label>
            <select
              id="sidebar-reasoning-effort-selector"
              value={preferredReasoningEffort}
              onChange={(e) =>
                onPreferredReasoningEffortChange(
                  e.target.value as PreferredReasoningEffort,
                )
              }
              disabled={!reasoningEnabled}
              title={t(language, "reasoningEffort")}
              aria-label={t(language, "reasoningEffort")}
              className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="auto">{t(language, "reasoningAuto")}</option>
              {reasoningOptionsUnique.map((effort) => (
                <option key={effort} value={effort}>
                  {effort === "low"
                    ? t(language, "reasoningLow")
                    : effort === "medium"
                      ? t(language, "reasoningMedium")
                      : effort === "high"
                        ? t(language, "reasoningHigh")
                        : t(language, "reasoningXHigh")}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded-lg border border-surface-dark-3 bg-surface-dark-2 px-2 py-1.5">
              <div className="text-gray-500">
                {t(language, "toolsAvailable")}
              </div>
              <div className="text-gray-200 mt-0.5">{toolsCount}</div>
            </div>
            <div className="rounded-lg border border-surface-dark-3 bg-surface-dark-2 px-2 py-1.5">
              <div className="text-gray-500">
                {t(language, "quotaRemaining")}
              </div>
              <div className="text-gray-200 mt-0.5">
                {quotaRemainingPercent == null
                  ? "—"
                  : `${quotaRemainingPercent}%`}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="sidebar-conversation-search"
              className="block text-[10px] text-gray-500 px-1 pb-1"
            >
              {t(language, "conversationSearch")}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                id="sidebar-conversation-search"
                value={conversationQuery}
                onChange={(e) => setConversationQuery(e.target.value)}
                placeholder={t(language, "conversationSearchPlaceholder")}
                aria-label={t(language, "conversationSearch")}
                className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="border border-surface-dark-3 rounded-xl bg-surface-dark-2/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-1.5 px-1">
              {workspaceCollapsed ? (
                <button
                  type="button"
                  onClick={() => setWorkspaceCollapsed((prev) => !prev)}
                  aria-expanded="false"
                  aria-controls="sidebar-workspace-panel"
                  className="flex items-center gap-1.5 text-gray-300"
                  title={t(language, "workspace")}
                >
                  <Wrench className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-[11px] font-medium">
                    {t(language, "workspace")}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setWorkspaceCollapsed((prev) => !prev)}
                  aria-expanded="true"
                  aria-controls="sidebar-workspace-panel"
                  className="flex items-center gap-1.5 text-gray-300"
                  title={t(language, "workspace")}
                >
                  <Wrench className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-[11px] font-medium">
                    {t(language, "workspace")}
                  </span>
                </button>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-gray-500 transition-transform ${workspaceCollapsed ? "-rotate-90" : "rotate-0"}`}
              />
            </div>
            {!workspaceCollapsed && (
              <div id="sidebar-workspace-panel">
                <div className="text-xs text-gray-500 px-1">
                  {t(language, "defaultWorkspace")}
                </div>
                <div className="flex items-center gap-1.5 bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5">
                  <div
                    className="flex-1 text-xs text-gray-300 truncate"
                    title={defaultWorkspace || "-"}
                  >
                    {defaultWorkspace || "-"}
                  </div>
                  <button
                    type="button"
                    onClick={copyWorkspace}
                    disabled={!defaultWorkspace}
                    className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-surface-dark-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t(language, "copy")}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                {workspaceCopied && (
                  <div className="text-xs text-brand-300 px-1">
                    {t(language, "copied")}
                  </div>
                )}
                <div className="text-xs text-gray-500 px-1">
                  {t(language, "outputDir")}
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    placeholder={t(language, "outputDirPlaceholder")}
                    aria-label={t(language, "outputDir")}
                    className="flex-1 bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={saveOutputDir}
                    disabled={outputDir.trim().length === 0}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-dark-2 border border-surface-dark-3 text-gray-200 hover:bg-surface-dark-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t(language, "saveOutputDir")}
                  </button>
                </div>
                {outputDirSaved && (
                  <div className="text-[10px] text-brand-300 px-1">
                    {t(language, "saved")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border border-surface-dark-3 rounded-xl bg-surface-dark-2/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-1.5 px-1">
              {templatesCollapsed ? (
                <button
                  type="button"
                  onClick={() => setTemplatesCollapsed((prev) => !prev)}
                  aria-expanded="false"
                  aria-controls="sidebar-skills-panel"
                  className="flex items-center gap-1.5 text-gray-300"
                  title={t(language, "skills")}
                >
                  <Wrench className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-[11px] font-medium">
                    {t(language, "skills")}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setTemplatesCollapsed((prev) => !prev)}
                  aria-expanded="true"
                  aria-controls="sidebar-skills-panel"
                  className="flex items-center gap-1.5 text-gray-300"
                  title={t(language, "skills")}
                >
                  <Wrench className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-[11px] font-medium">
                    {t(language, "skills")}
                  </span>
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setTemplatesCollapsed(false);
                    setAddingTemplate(true);
                  }}
                  className="text-[10px] px-2 py-0.5 rounded border border-surface-dark-3 text-gray-300 hover:bg-surface-dark-3"
                  title={t(language, "addTemplate")}
                >
                  {t(language, "addTemplate")}
                </button>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-gray-500 transition-transform ${templatesCollapsed ? "-rotate-90" : "rotate-0"}`}
                />
              </div>
            </div>
            {!templatesCollapsed && (
              <div id="sidebar-skills-panel">
                {addingTemplate && (
                  <div className="space-y-1.5 p-1 rounded-lg border border-surface-dark-3 bg-surface-dark-1">
                    <input
                      value={templateTitle}
                      onChange={(e) => setTemplateTitle(e.target.value)}
                      placeholder={t(language, "templateTitlePlaceholder")}
                      aria-label={t(language, "templateTitle")}
                      className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <input
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder={t(
                        language,
                        "templateDescriptionPlaceholder",
                      )}
                      aria-label={t(language, "templateDescription")}
                      className="w-full bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <textarea
                      value={templatePrompt}
                      onChange={(e) => setTemplatePrompt(e.target.value)}
                      placeholder={t(language, "templatePromptPlaceholder")}
                      aria-label={t(language, "templatePrompt")}
                      rows={3}
                      className="w-full resize-y bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTemplate(false);
                          setTemplateTitle("");
                          setTemplateDescription("");
                          setTemplatePrompt("");
                        }}
                        className="text-[10px] px-2 py-1 rounded-md bg-surface-dark-2 border border-surface-dark-3 text-gray-300 hover:bg-surface-dark-3"
                      >
                        {t(language, "cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={addTemplate}
                        disabled={
                          templateTitle.trim().length === 0 ||
                          templatePrompt.trim().length === 0
                        }
                        className="text-[10px] px-2 py-1 rounded-md bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t(language, "add")}
                      </button>
                    </div>
                  </div>
                )}

                <input
                  id="sidebar-skill-search"
                  value={skillQuery}
                  onChange={(e) => setSkillQuery(e.target.value)}
                  placeholder={t(language, "skillSearchPlaceholder")}
                  aria-label={t(language, "skillSearch")}
                  className="w-full bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                  {filteredSkills.slice(0, 10).map((skill) => {
                    const isCustom = skill.id.startsWith(
                      CUSTOM_TEMPLATE_PREFIX,
                    );
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center gap-1 rounded-lg border border-surface-dark-3 bg-surface-dark-1 px-1 py-1"
                      >
                        <button
                          type="button"
                          onClick={() => onRunSkill(skill)}
                          className="flex-1 text-left px-1 py-0.5 hover:bg-surface-dark-3 rounded transition-colors"
                          title={skill.description}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-[11px] text-gray-200 font-medium truncate">
                              {skill.title}
                            </div>
                            {skill.id === "deep-research" && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded border border-brand-600/50 text-brand-300 bg-brand-900/20 flex-shrink-0">
                                CLI/Fleet
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-500 truncate">
                            {skill.description}
                          </div>
                        </button>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => removeTemplate(skill.id)}
                            className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-900/20"
                            title={t(language, "delete")}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="border border-surface-dark-3 rounded-xl bg-surface-dark-2/40 p-2 space-y-1.5">
            <div className="flex items-center gap-1.5 px-1">
              <Wrench className="w-3.5 h-3.5 text-brand-400" />
              <span className="text-[11px] text-gray-300 font-medium">
                {t(language, "mcpQuickConnect")}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder={t(language, "mcpUrlPlaceholder")}
                aria-label={t(language, "mcpQuickConnect")}
                className="flex-1 bg-surface-dark-1 border border-surface-dark-3 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => {
                  const value = mcpUrl.trim();
                  if (!value) return;
                  onQuickMcpByUrl(value);
                  setMcpUrl("");
                }}
                disabled={mcpUrl.trim().length === 0}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-dark-2 border border-surface-dark-3 text-gray-200 hover:bg-surface-dark-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t(language, "mcpConnectByUrl")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conversation list */}
      <nav className="flex-1 px-2 pb-4 space-y-0.5">
        {filteredConversations.map((conv) => (
          <div
            key={conv.id}
            className={`group sidebar-item ${conv.id === activeId ? "active" : ""}`}
          >
            {editingId === conv.id && !collapsed ? (
              <>
                <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-500" />
                <div className="flex items-center gap-1 flex-1 min-w-0">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    placeholder={t(language, "renameTitle")}
                    title={t(language, "renameTitle")}
                    aria-label={t(language, "renameTitle")}
                    className="flex-1 bg-surface-dark-0 text-xs rounded px-1.5 py-0.5 border border-surface-dark-4 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={commitRename}
                    title={t(language, "saveRename")}
                    aria-label={t(language, "saveRename")}
                    className="text-green-400 hover:text-green-300"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    title={t(language, "cancelRename")}
                    aria-label={t(language, "cancelRename")}
                    className="text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  ref={(element) => {
                    conversationButtonRefs.current[conv.id] = element;
                  }}
                  onClick={() => onSelect(conv.id)}
                  aria-label={conv.title}
                  title={conv.title}
                  className={`flex items-center gap-2 min-w-0 ${
                    collapsed ? "w-full justify-center" : "flex-1"
                  } focus:outline-none focus:ring-1 focus:ring-brand-500 rounded`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0 text-gray-500" />
                  {!collapsed && (
                    <span className="flex-1 truncate text-xs">
                      {conv.title}
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <div className="hidden group-hover:flex group-focus-within:flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startRename(conv)}
                      className="p-1 rounded hover:bg-surface-dark-4 text-gray-500 hover:text-gray-300"
                      title={t(language, "rename")}
                      aria-label={t(language, "rename")}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(conv.id)}
                      className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400"
                      title={t(language, "delete")}
                      aria-label={t(language, "delete")}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {filteredConversations.length === 0 && !collapsed && (
          <div className="text-center text-gray-600 text-xs py-8">
            {t(language, "noConversations")}
          </div>
        )}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-surface-dark-3 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500">
              {t(language, "theme")}
            </span>
            <div className="flex rounded-lg overflow-hidden border border-surface-dark-3">
              <button
                type="button"
                onClick={() => onThemeModeChange("dark")}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] ${
                  themeMode === "dark"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-dark-2 text-gray-400 hover:text-gray-200"
                }`}
                title={t(language, "themeDark")}
                aria-label={t(language, "themeDark")}
              >
                <Moon className="w-3 h-3" />
                {t(language, "themeDark")}
              </button>
              <button
                type="button"
                onClick={() => onThemeModeChange("light")}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] ${
                  themeMode === "light"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-dark-2 text-gray-400 hover:text-gray-200"
                }`}
                title={t(language, "themeLight")}
                aria-label={t(language, "themeLight")}
              >
                <Sun className="w-3 h-3" />
                {t(language, "themeLight")}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500">
              {t(language, "language")}
            </span>
            <div className="flex rounded-lg overflow-hidden border border-surface-dark-3">
              <button
                type="button"
                onClick={() => onLanguageChange("ja")}
                aria-label={t(language, "langJa")}
                className={`px-2 py-1 text-[10px] ${
                  language === "ja"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-dark-2 text-gray-400 hover:text-gray-200"
                }`}
              >
                {t(language, "langJa")}
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange("en")}
                aria-label={t(language, "langEn")}
                className={`px-2 py-1 text-[10px] ${
                  language === "en"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-dark-2 text-gray-400 hover:text-gray-200"
                }`}
              >
                {t(language, "langEn")}
              </button>
            </div>
          </div>
          {/* Switch to Simple UI */}
          <button
            type="button"
            onClick={() => setUiMode("simple")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] text-gray-400 hover:text-brand-400 hover:bg-surface-dark-2 transition-colors"
          >
            <Minimize2 className="w-3 h-3" />
            {t(language, "switchToSimple")}
          </button>

          <div className="text-[10px] text-gray-600 text-center space-y-1">
            <div>{t(language, "poweredBy")}</div>
            <div>
              {t(language, "appVersion")}: {APP_VERSION || "-"}
            </div>
            <div>
              {t(language, "signature")}: {APP_SIGNATURE || "-"}
            </div>
            {hasRepositoryUrl ? (
              <a
                href={APP_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-brand-400 hover:text-brand-300 break-all"
              >
                {t(language, "repository")}: {APP_REPOSITORY_URL}
              </a>
            ) : (
              <div>{t(language, "repository")}: -</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
