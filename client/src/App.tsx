/**
 * App — Root layout. Switches between Simple and Advanced modes.
 */

import { lazy, Suspense, useMemo } from "react";
import { Minimize2 } from "lucide-react";
import { useChat } from "./lib/useChat";
import { useChatStore } from "./lib/store";
import { getSkills } from "./lib/skills";
import { t } from "./lib/i18n";
import { Sidebar } from "./components/Sidebar";
import { ChatArea } from "./components/ChatArea";
import { WelcomeScreen } from "./components/WelcomeScreen";
import type { ReasoningEffort } from "./lib/types";

const SimpleApp = lazy(() => import("./components/SimpleApp"));

const DEFAULT_REASONING_OPTIONS: ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

function isResearchSupportedModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.startsWith("gpt-5")) return true;
  if (normalized.startsWith("claude-sonnet")) return true;
  if (normalized.startsWith("claude-opus")) return true;

  return false;
}

export function App() {
  const { uiMode } = useChatStore();

  if (uiMode === "simple") {
    return (
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-surface-dark-0 text-gray-400">
            Loading…
          </div>
        }
      >
        <SimpleApp />
      </Suspense>
    );
  }

  return <AdvancedApp />;
}

function AdvancedApp() {
  const chat = useChat();
  const skills = useMemo(() => getSkills(chat.uiLanguage), [chat.uiLanguage]);
  const selectedModelInfo = useMemo(
    () => chat.modelCatalog.find((model) => model.id === chat.preferredModel),
    [chat.modelCatalog, chat.preferredModel],
  );
  const reasoningOptions = selectedModelInfo?.supportedReasoningEfforts?.length
    ? selectedModelInfo.supportedReasoningEfforts
    : DEFAULT_REASONING_OPTIONS;
  const reasoningEnabled = Boolean(selectedModelInfo?.reasoningSupported);
  const researchAvailable = isResearchSupportedModel(
    chat.active?.model ?? chat.preferredModel,
  );
  const primaryQuota =
    chat.quotaSnapshots.chat ??
    chat.quotaSnapshots.premium_interactions ??
    Object.values(chat.quotaSnapshots)[0] ??
    null;
  const quotaRemainingPercent = primaryQuota
    ? Math.max(0, Math.round(primaryQuota.remainingPercentage))
    : null;
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

  return (
    <div
      className={`flex h-screen overflow-hidden ${
        chat.themeMode === "light"
          ? "theme-light bg-surface-0 text-gray-900"
          : "bg-surface-dark-0 text-gray-100"
      }`}
    >
      {/* Sidebar */}
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        onSelect={chat.switchChat}
        onCreate={() => chat.createChat({ model: chat.preferredModel })}
        onDelete={chat.deleteChat}
        onRename={chat.renameChat}
        availableModels={chat.availableModels}
        modelCatalog={chat.modelCatalog}
        preferredModel={chat.preferredModel}
        onPreferredModelChange={(model) => {
          chat.setPreferredModel(model);
          if (!chat.active) return;
          chat.setConversationModel(chat.active.id, model);
        }}
        preferredAgentMode={chat.preferredAgentMode}
        onPreferredAgentModeChange={chat.setPreferredAgentMode}
        preferredReasoningEffort={chat.preferredReasoningEffort}
        onPreferredReasoningEffortChange={chat.setPreferredReasoningEffort}
        reasoningOptions={reasoningOptions}
        reasoningEnabled={reasoningEnabled}
        toolsCount={chat.availableToolsCatalog.length}
        quotaRemainingPercent={quotaRemainingPercent}
        quotaUsageRatePercent={quotaUsageRatePercent}
        quotaUsageRatio={quotaUsageRatio}
        language={chat.uiLanguage}
        onLanguageChange={chat.setUiLanguage}
        themeMode={chat.themeMode}
        onThemeModeChange={chat.setThemeMode}
        userProfile={chat.userProfile}
        onUserProfileChange={chat.setUserProfile}
        copilotPersona={chat.copilotPersona}
        onCopilotPersonaChange={chat.setCopilotPersona}
        skills={skills}
        onRunSkill={chat.runSkill}
        onQuickMcpByUrl={chat.quickConnectMcpByUrl}
      />

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {!chat.active && (
          <div className="absolute top-3 right-3 z-20">
            <button
              onClick={() => chat.setUiMode("simple")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-surface-dark-2 border border-surface-dark-3 text-gray-300 hover:text-white hover:border-brand-500/40 transition-colors"
              title={t(chat.uiLanguage, "switchToSimple")}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              {t(chat.uiLanguage, "simpleMode")}
            </button>
          </div>
        )}
        {chat.active ? (
          <ChatArea
            conversation={chat.active}
            isGenerating={chat.isGenerating}
            streamBuffer={chat.streamBuffer}
            activeTools={chat.activeTools}
            availableToolsCatalog={chat.availableToolsCatalog}
            mode={chat.active.mode ?? chat.preferredAgentMode}
            onModeChange={(mode) => {
              if (!chat.active) return;
              chat.setConversationMode(chat.active.id, mode);
            }}
            onSend={chat.sendMessage}
            onAbort={chat.abortGeneration}
            onCompact={chat.compactActiveSession}
            onToolPolicyChange={(policy) => {
              if (!chat.active) return;
              chat.setConversationToolPolicy(chat.active.id, policy);
            }}
            researchAvailable={researchAvailable}
            onNewChat={() => chat.createChat({ model: chat.preferredModel })}
            onSwitchToSimple={() => chat.setUiMode("simple")}
            language={chat.uiLanguage}
          />
        ) : (
          <WelcomeScreen
            language={chat.uiLanguage}
            displayName={chat.userProfile.displayName}
            models={chat.availableModels}
            onNewChat={(model) => {
              const selected = model ?? chat.preferredModel;
              chat.setPreferredModel(selected);
              chat.createChat({ model: selected });
            }}
            onQuickPrompt={(prompt) =>
              chat.createChat({
                model: chat.preferredModel,
                initialPrompt: prompt,
                title:
                  chat.uiLanguage === "ja" ? "クイック開始" : "Quick Start",
              })
            }
          />
        )}
      </main>
    </div>
  );
}
