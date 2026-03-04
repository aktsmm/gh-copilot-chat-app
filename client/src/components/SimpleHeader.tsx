/**
 * SimpleHeader — A minimal header bar for Simple UI mode.
 * Contains: model selector, New Chat button, history toggle, Advanced switch.
 */

import { Plus, PanelLeft, Settings2 } from "lucide-react";
import type { RefObject } from "react";
import type { UiLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface Props {
  models: string[];
  activeModel: string;
  modelOptionLabels?: Record<string, string>;
  activeModelRateMultiplierLabel?: string | null;
  onModelChange: (model: string) => void;
  onNewChat: () => void;
  onSwitchToAdvanced: () => void;
  onToggleHistory: () => void;
  historyToggleButtonRef?: RefObject<HTMLButtonElement | null>;
  showHistory: boolean;
  language: UiLanguage;
  quotaUsageRatePercent?: number | null;
  quotaUsageRatio?: string | null;
}

export function SimpleHeader({
  models,
  activeModel,
  modelOptionLabels,
  activeModelRateMultiplierLabel,
  onModelChange,
  onNewChat,
  onSwitchToAdvanced,
  onToggleHistory,
  historyToggleButtonRef,
  showHistory,
  language,
  quotaUsageRatePercent,
  quotaUsageRatio,
}: Props) {
  return (
    <header className="flex items-center h-12 px-3 gap-2 border-b border-surface-dark-2 bg-surface-dark-1/80 backdrop-blur-sm shrink-0">
      {/* History toggle */}
      <button
        ref={historyToggleButtonRef}
        type="button"
        onClick={onToggleHistory}
        className={`p-1.5 rounded-lg transition-colors ${
          showHistory
            ? "bg-brand-600/20 text-brand-400"
            : "text-gray-400 hover:text-gray-200 hover:bg-surface-dark-2"
        }`}
        title={t(language, "conversations")}
        aria-label={t(language, "conversations")}
      >
        <PanelLeft className="w-4 h-4" />
      </button>

      {/* Model selector */}
      <select
        value={activeModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="bg-surface-dark-2 text-sm text-gray-200 rounded-lg px-2 py-1 border border-surface-dark-3 focus:border-brand-500 focus:outline-none min-w-0 max-w-[200px] truncate"
        title={t(language, "modelSelector")}
        aria-label={t(language, "modelSelector")}
      >
        {models.map((model) => (
          <option key={model} value={model}>
            {modelOptionLabels?.[model] ?? model}
          </option>
        ))}
      </select>

      <span className="hidden lg:inline text-[10px] text-gray-500 whitespace-nowrap">
        {t(language, "modelRateMultiplier")}:{" "}
        {activeModelRateMultiplierLabel ?? "—"}
      </span>

      <span className="hidden md:inline text-[10px] text-gray-500 whitespace-nowrap">
        {t(language, "quotaUsageRate")}:{" "}
        {quotaUsageRatePercent == null
          ? "—"
          : `${quotaUsageRatePercent}%${quotaUsageRatio ? ` (${quotaUsageRatio})` : ""}`}
      </span>

      <div className="flex-1" />

      {/* New Chat */}
      <button
        data-action="new-chat"
        type="button"
        onClick={onNewChat}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors"
        title={t(language, "newChat")}
        aria-label={t(language, "newChat")}
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{t(language, "newShort")}</span>
      </button>

      {/* Switch to Advanced */}
      <button
        type="button"
        onClick={onSwitchToAdvanced}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-gray-300 hover:text-white bg-surface-dark-2 border border-surface-dark-3 hover:border-brand-500/40 transition-colors"
        title={t(language, "switchToAdvanced")}
        aria-label={t(language, "switchToAdvanced")}
      >
        <Settings2 className="w-4 h-4" />
        {t(language, "advancedMode")}
      </button>
    </header>
  );
}
