/**
 * SimpleApp — Root layout for Simple (ChatGPT-like) UI mode.
 *
 * Reuses: useChat(), MessageBubble, StreamingBubble, ChatInput, WelcomeScreen
 * Replaces: Sidebar → drawer, ToolCallIndicator → SimpleToolIndicator
 * Goal: minimal UI for ChatGPT/Claude Web users who just want to chat.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { setUiMode } from "../lib/store";
import { useChat } from "../lib/useChat";
import { t } from "../lib/i18n";
import { getLocalServerUrl } from "../lib/runtime-url";
import type { ChatMessage, UiLanguage } from "../lib/types";
import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";
import { ChatInput } from "./ChatInput";
import { SimpleHeader } from "./SimpleHeader";
import { SimpleToolIndicator } from "./SimpleToolIndicator";
import { WelcomeScreen } from "./WelcomeScreen";
import { TypingIndicator } from "./TypingIndicator";

function isResearchSupportedModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.startsWith("gpt-5")) return true;
  if (normalized.startsWith("claude-sonnet")) return true;
  if (normalized.startsWith("claude-opus")) return true;

  return false;
}

function formatRateMultiplier(multiplier: number): string {
  const rounded = Number(multiplier.toFixed(2));
  return `${rounded}x`;
}

/* ------------------------------------------------------------------ */
/*  History drawer                                                      */
/* ------------------------------------------------------------------ */

interface HistoryDrawerProps {
  language: UiLanguage;
  conversations: { id: string; title: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function HistoryDrawer({
  language,
  conversations,
  activeId,
  onSelect,
  onClose,
}: HistoryDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      if (event.shiftKey) {
        if (
          !activeElement ||
          activeElement === first ||
          !panel.contains(activeElement)
        ) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (!activeElement || !panel.contains(activeElement)) {
          event.preventDefault();
          first.focus();
          return;
        }
        if (activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        id="simple-history-drawer"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(language, "conversations")}
        className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-surface-dark-1 border-r border-surface-dark-2 flex flex-col animate-slide-right"
      >
        <div className="flex items-center justify-between h-12 px-3 border-b border-surface-dark-2">
          <span className="text-sm font-medium text-gray-200">
            {t(language, "conversations")}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-dark-2"
            title={t(language, "cancel")}
            aria-label={t(language, "cancel")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-8">
              {t(language, "noConversations")}
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-current={c.id === activeId ? "page" : undefined}
              onClick={() => {
                onSelect(c.id);
                onClose();
              }}
              className={`w-full text-left px-4 py-2.5 text-sm truncate transition-colors ${
                c.id === activeId
                  ? "bg-brand-600/15 text-brand-400"
                  : "text-gray-300 hover:bg-surface-dark-2"
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SimpleApp                                                           */
/* ------------------------------------------------------------------ */

export default function SimpleApp() {
  const chat = useChat();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const historyToggleButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const userNearBottomRef = useRef(true);
  const [showHistory, setShowHistory] = useState(false);
  const [researchMode, setResearchMode] = useState(false);

  const {
    conversations,
    activeId,
    active,
    uiLanguage: language,
    availableModels,
    modelCatalog,
    preferredModel,
    isGenerating,
    streamBuffer,
    activeTools,
  } = chat;

  const messages: ChatMessage[] = active?.messages ?? [];
  const researchAvailable = isResearchSupportedModel(
    active?.model ?? preferredModel,
  );
  const primaryQuota =
    chat.quotaSnapshots.chat ??
    chat.quotaSnapshots.premium_interactions ??
    Object.values(chat.quotaSnapshots)[0] ??
    null;
  const quotaUsageRatePercent =
    primaryQuota && primaryQuota.entitlementRequests > 0
      ? Math.max(
          0,
          Math.round(
            (primaryQuota.usedRequests / primaryQuota.entitlementRequests) *
              100,
          ),
        )
      : null;
  const quotaUsageRatio = primaryQuota
    ? `${primaryQuota.usedRequests}/${primaryQuota.entitlementRequests}`
    : null;
  const modelRateMultiplierById = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of modelCatalog) {
      if (model.rateMultiplier == null) continue;
      map.set(model.id, formatRateMultiplier(model.rateMultiplier));
    }
    return map;
  }, [modelCatalog]);
  const modelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const model of modelCatalog) {
      map.set(model.id, model.name || model.id);
    }
    return map;
  }, [modelCatalog]);
  const modelOptionLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const model of availableModels) {
      const rateLabel = modelRateMultiplierById.get(model);
      const displayName = modelNameById.get(model) ?? model;
      labels[model] = rateLabel ? `${displayName} (${rateLabel})` : displayName;
    }
    return labels;
  }, [availableModels, modelNameById, modelRateMultiplierById]);
  const activeModelRateMultiplierLabel = modelRateMultiplierById.get(
    active?.model ?? preferredModel,
  );
  const localServerUrl = useMemo(() => getLocalServerUrl(), []);

  const isNearBottom = useCallback((): boolean => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= 120;
  }, []);

  const handleMessagesScroll = useCallback(() => {
    userNearBottomRef.current = isNearBottom();
  }, [isNearBottom]);

  // Auto-scroll when the user is already near the bottom
  useEffect(() => {
    if (!userNearBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: isGenerating ? "auto" : "smooth",
    });
  }, [messages.length, activeTools.length, isGenerating, isNearBottom]);

  const handleSend = useCallback(
    (prompt: string) => {
      const useResearch = researchMode && researchAvailable;
      chat.sendMessage(prompt, {
        useDeepResearchPrompt: useResearch,
        useFleetResearch: useResearch,
      });
      if (researchMode) {
        setResearchMode(false);
      }
    },
    [chat, researchAvailable, researchMode],
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      chat.createChat({
        model: preferredModel,
        initialPrompt: prompt,
        title: language === "ja" ? "クイック開始" : "Quick Start",
      });
    },
    [chat, preferredModel, language],
  );

  const handleNewChat = useCallback(
    (model?: string) => {
      const selected = model ?? preferredModel;
      chat.setPreferredModel(selected);
      chat.createChat({ model: selected });
    },
    [chat, preferredModel],
  );

  const closeHistoryDrawer = useCallback(() => {
    setShowHistory(false);
    const restoreTarget =
      previousFocusedElementRef.current ?? historyToggleButtonRef.current;
    previousFocusedElementRef.current = null;
    setTimeout(() => {
      restoreTarget?.focus();
    }, 0);
  }, []);

  const toggleHistoryDrawer = useCallback(() => {
    if (showHistory) {
      closeHistoryDrawer();
      return;
    }

    const activeElement =
      typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    previousFocusedElementRef.current =
      activeElement ?? historyToggleButtonRef.current;
    setShowHistory(true);
  }, [closeHistoryDrawer, showHistory]);

  const sortedConversations = [...conversations].sort(
    (a, b) => b.lastUsed - a.lastUsed,
  );

  const hasActiveConversation = active !== null;

  useEffect(() => {
    setResearchMode(false);
    if (!activeId) return;
    const timerId = window.setTimeout(() => {
      userNearBottomRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 0);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [activeId]);

  useEffect(() => {
    if (!researchAvailable) {
      setResearchMode(false);
    }
  }, [researchAvailable]);

  return (
    <div
      className={`flex flex-col h-screen ${chat.themeMode === "light" ? "theme-light bg-surface-0 text-gray-900" : "bg-surface-dark-0 text-gray-100"}`}
    >
      {/* Header */}
      <SimpleHeader
        models={availableModels}
        activeModel={active?.model ?? preferredModel}
        isGenerating={isGenerating}
        modelOptionLabels={modelOptionLabels}
        activeModelRateMultiplierLabel={activeModelRateMultiplierLabel}
        onModelChange={(model) => {
          chat.setPreferredModel(model);
          if (!active) return;
          chat.setConversationModel(active.id, model);
        }}
        onNewChat={() => handleNewChat()}
        onSwitchToAdvanced={() => setUiMode("advanced")}
        onToggleHistory={toggleHistoryDrawer}
        historyToggleButtonRef={historyToggleButtonRef}
        showHistory={showHistory}
        language={language}
        quotaUsageRatePercent={quotaUsageRatePercent}
        quotaUsageRatio={quotaUsageRatio}
        localServerUrl={localServerUrl}
      />

      {/* History drawer */}
      {showHistory && (
        <HistoryDrawer
          language={language}
          conversations={sortedConversations.map((c) => ({
            id: c.id,
            title: c.title,
          }))}
          activeId={activeId}
          onSelect={chat.switchChat}
          onClose={closeHistoryDrawer}
        />
      )}

      {/* Main area */}
      {!hasActiveConversation ? (
        <WelcomeScreen
          language={language}
          displayName={chat.userProfile.displayName}
          models={availableModels}
          onNewChat={handleNewChat}
          onQuickPrompt={handleQuickPrompt}
        />
      ) : (
        <>
          {/* Messages */}
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="flex-1 overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {/* Prompt suggestions when conversation is empty */}
              {messages.length === 0 && !isGenerating && (
                <div className="flex flex-col items-center justify-center pt-16 pb-8 space-y-6">
                  <p className="text-sm text-gray-500">
                    {t(language, "emptyMessage")}
                  </p>
                </div>
              )}

              {messages.map((msg: ChatMessage) => (
                <MessageBubble key={msg.id} message={msg} language={language} />
              ))}

              {/* Tool indicator (simplified) */}
              <SimpleToolIndicator tools={activeTools} language={language} />

              {/* Streaming response */}
              {isGenerating && streamBuffer && (
                <StreamingBubble content={streamBuffer} language={language} />
              )}

              {/* Typing dots */}
              {isGenerating && !streamBuffer && activeTools.length === 0 && (
                <TypingIndicator language={language} />
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input */}
          <ChatInput
            key={active.id}
            onSend={handleSend}
            onAbort={chat.abortGeneration}
            isGenerating={isGenerating}
            disabled={false}
            language={language}
            researchMode={researchMode}
            onToggleResearch={() => setResearchMode((prev) => !prev)}
            researchAvailable={researchAvailable}
          />
        </>
      )}
    </div>
  );
}
