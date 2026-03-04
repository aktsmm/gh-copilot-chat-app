/**
 * ChatArea — Messages list + input composer.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Plus, Zap, FlaskConical, Minimize2 } from "lucide-react";
import type {
  AgentMode,
  Conversation,
  ToolCall,
  ToolInfoLite,
  UiLanguage,
} from "../lib/types";
import { MessageBubble } from "./MessageBubble";
import { ToolCallIndicator } from "./ToolCallIndicator";
import { TypingIndicator } from "./TypingIndicator";
import { ChatInput } from "./ChatInput";
import { StreamingBubble } from "./StreamingBubble";
import { t } from "../lib/i18n";

function getToolOptionValue(tool: ToolInfoLite): string {
  return tool.namespacedName ?? tool.name;
}

interface ChatAreaProps {
  conversation: Conversation;
  isGenerating: boolean;
  streamBuffer: string;
  activeTools: ToolCall[];
  availableToolsCatalog: ToolInfoLite[];
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onSend: (
    prompt: string,
    options?: {
      mode?: AgentMode;
      useDeepResearchPrompt?: boolean;
      useFleetResearch?: boolean;
    },
  ) => void;
  onAbort: () => void;
  onCompact: () => void;
  onToolPolicyChange: (policy: {
    availableTools?: string[];
    excludedTools?: string[];
  }) => void;
  researchAvailable: boolean;
  onNewChat: () => void;
  onSwitchToSimple: () => void;
  language: UiLanguage;
}

export function ChatArea({
  conversation,
  isGenerating,
  streamBuffer,
  activeTools,
  availableToolsCatalog,
  mode,
  onModeChange,
  onSend,
  onAbort,
  onCompact,
  onToolPolicyChange,
  researchAvailable,
  onNewChat,
  onSwitchToSimple,
  language,
}: ChatAreaProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [toolPolicyMode, setToolPolicyMode] = useState<
    "all" | "allow" | "exclude"
  >("all");
  const [toolCategory, setToolCategory] = useState<string>("all");
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  const toolCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const tool of availableToolsCatalog) {
      categories.add(tool.category || "other");
    }
    return [
      "all",
      ...Array.from(categories).sort((a, b) => a.localeCompare(b)),
    ];
  }, [availableToolsCatalog]);

  const filteredTools = useMemo(() => {
    if (toolCategory === "all") return availableToolsCatalog;
    return availableToolsCatalog.filter(
      (tool) => tool.category === toolCategory,
    );
  }, [availableToolsCatalog, toolCategory]);

  const filteredToolValues = useMemo(
    () => new Set(filteredTools.map((tool) => getToolOptionValue(tool))),
    [filteredTools],
  );

  useEffect(() => {
    setResearchMode(false);
  }, [conversation.id]);

  useEffect(() => {
    if (!researchAvailable) {
      setResearchMode(false);
    }
  }, [researchAvailable]);

  useEffect(() => {
    if (conversation.availableTools && conversation.availableTools.length > 0) {
      setToolPolicyMode("allow");
      setSelectedTools(conversation.availableTools);
      return;
    }

    if (conversation.excludedTools && conversation.excludedTools.length > 0) {
      setToolPolicyMode("exclude");
      setSelectedTools(conversation.excludedTools);
      return;
    }

    setToolPolicyMode("all");
    setSelectedTools([]);
  }, [
    conversation.id,
    conversation.availableTools,
    conversation.excludedTools,
  ]);

  useEffect(() => {
    if (toolCategories.includes(toolCategory)) return;
    setToolCategory("all");
  }, [toolCategories, toolCategory]);

  useEffect(() => {
    if (availableToolsCatalog.length === 0) return;
    const knownTools = new Set(
      availableToolsCatalog.map((tool) => getToolOptionValue(tool)),
    );
    const policyTools = new Set([
      ...(conversation.availableTools ?? []),
      ...(conversation.excludedTools ?? []),
    ]);

    setSelectedTools((current) => {
      const normalized = current.filter(
        (name) => knownTools.has(name) || policyTools.has(name),
      );
      return normalized.length === current.length ? current : normalized;
    });
  }, [
    availableToolsCatalog,
    conversation.availableTools,
    conversation.excludedTools,
  ]);

  const isNearBottom = useCallback((): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= 120;
  }, []);

  const applyToolPolicy = () => {
    if (toolPolicyMode === "all") {
      onToolPolicyChange({
        availableTools: undefined,
        excludedTools: undefined,
      });
      return;
    }

    const normalized = [
      ...new Set(selectedTools.map((name) => name.trim()).filter(Boolean)),
    ];

    if (toolPolicyMode === "allow") {
      onToolPolicyChange({
        availableTools: normalized,
        excludedTools: undefined,
      });
      return;
    }

    onToolPolicyChange({
      availableTools: undefined,
      excludedTools: normalized,
    });
  };

  // Auto-scroll to bottom on new messages / streaming
  useEffect(() => {
    if (!isNearBottom()) return;
    bottomRef.current?.scrollIntoView({
      behavior: isGenerating ? "auto" : "smooth",
    });
  }, [
    conversation.messages.length,
    streamBuffer,
    activeTools.length,
    isGenerating,
    isNearBottom,
  ]);

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-surface-dark-3 bg-surface-dark-1/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold text-gray-200 truncate">
            {conversation.title}
          </h2>
          <span className="text-[10px] text-gray-500 bg-surface-dark-3 px-2 py-0.5 rounded-full flex-shrink-0">
            {conversation.model}
          </span>
          {researchMode && (
            <span className="inline-flex items-center gap-1 text-[10px] text-brand-300 bg-brand-900/30 border border-brand-600/30 px-2 py-0.5 rounded-full flex-shrink-0">
              <FlaskConical className="w-3 h-3" />
              {t(language, "researchMode")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as AgentMode)}
            className="text-[11px] bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
            title={t(language, "agentMode")}
            aria-label={t(language, "agentMode")}
          >
            <option value="interactive">
              {t(language, "modeInteractive")}
            </option>
            <option value="plan">{t(language, "modePlan")}</option>
            <option value="autopilot">{t(language, "modeAutopilot")}</option>
          </select>
          <button
            type="button"
            onClick={onCompact}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-surface-dark-3 transition-colors"
            title={t(language, "compactContext")}
            aria-label={t(language, "compactContext")}
          >
            <Minimize2 className="w-3.5 h-3.5" />
            {t(language, "compactContext")}
          </button>
          <button
            data-action="new-chat"
            type="button"
            onClick={onNewChat}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white
              px-2.5 py-1.5 rounded-lg hover:bg-surface-dark-3 transition-colors"
            title={t(language, "newChat")}
            aria-label={t(language, "newChat")}
          >
            <Plus className="w-3.5 h-3.5" />
            {t(language, "newShort")}
          </button>
          <button
            type="button"
            onClick={onSwitchToSimple}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-surface-dark-3 transition-colors"
            title={t(language, "switchToSimple")}
            aria-label={t(language, "switchToSimple")}
          >
            <Minimize2 className="w-3.5 h-3.5" />
            {t(language, "simpleMode")}
          </button>
        </div>
      </header>

      <div className="px-4 py-2 border-b border-surface-dark-3 bg-surface-dark-1/20">
        <div className="hidden md:block text-[10px] text-gray-500 mb-2">
          {t(language, "headerActionHint")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-gray-500">
            {t(language, "toolPolicy")}
          </span>
          <select
            value={toolPolicyMode}
            onChange={(e) =>
              setToolPolicyMode(e.target.value as "all" | "allow" | "exclude")
            }
            className="text-[11px] bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label={t(language, "toolPolicy")}
          >
            <option value="all">{t(language, "toolPolicyAll")}</option>
            <option value="allow">{t(language, "toolPolicyAllow")}</option>
            <option value="exclude">{t(language, "toolPolicyExclude")}</option>
          </select>

          <select
            value={toolCategory}
            onChange={(e) => setToolCategory(e.target.value)}
            className="text-[11px] bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
            aria-label={t(language, "toolCategory")}
          >
            {toolCategories.map((category) => (
              <option key={category} value={category}>
                {category === "all" ? t(language, "toolCategoryAll") : category}
              </option>
            ))}
          </select>

          <select
            multiple
            size={2}
            value={selectedTools}
            onChange={(e) => {
              const selectedInView = Array.from(e.target.selectedOptions).map(
                (option) => option.value,
              );
              setSelectedTools((current) => {
                const keepOutsideView = current.filter(
                  (value) => !filteredToolValues.has(value),
                );
                return [...new Set([...keepOutsideView, ...selectedInView])];
              });
            }}
            disabled={toolPolicyMode === "all" || filteredTools.length === 0}
            className="min-w-[220px] max-w-[360px] text-[11px] bg-surface-dark-2 border border-surface-dark-3 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t(language, "toolsAvailable")}
          >
            {filteredTools.map((tool) => (
              <option
                key={tool.namespacedName ?? tool.name}
                value={getToolOptionValue(tool)}
              >
                {tool.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={applyToolPolicy}
            className="text-[11px] px-2.5 py-1 rounded-lg bg-surface-dark-2 border border-surface-dark-3 text-gray-200 hover:bg-surface-dark-3"
          >
            {t(language, "applyToolPolicy")}
          </button>

          {filteredTools.length === 0 && (
            <span className="text-[10px] text-gray-500">
              {t(language, "noToolsAvailable")}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      >
        {conversation.messages.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Zap className="w-10 h-10 mb-3 text-brand-500/40" />
            <p className="text-sm">{t(language, "emptyMessage")}</p>
          </div>
        )}

        {conversation.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} language={language} />
        ))}

        {/* Active tool calls */}
        {activeTools.length > 0 && (
          <div className="space-y-1">
            {activeTools.map((t, i) => (
              <ToolCallIndicator key={t.id ?? `${t.name}-${i}`} tool={t} />
            ))}
          </div>
        )}

        {/* Streaming response */}
        {isGenerating && streamBuffer && (
          <StreamingBubble content={streamBuffer} language={language} />
        )}

        {/* Typing indicator when generating but no stream yet */}
        {isGenerating && !streamBuffer && activeTools.length === 0 && (
          <TypingIndicator language={language} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={(prompt) => {
          onSend(prompt, {
            mode,
            useDeepResearchPrompt: researchMode,
            useFleetResearch: researchMode,
          });
          if (researchMode) {
            setResearchMode(false);
          }
        }}
        onAbort={onAbort}
        isGenerating={isGenerating}
        disabled={false}
        language={language}
        researchMode={researchMode}
        onToggleResearch={() => setResearchMode((prev) => !prev)}
        researchAvailable={researchAvailable}
      />
    </div>
  );
}
