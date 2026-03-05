/**
 * SimpleHeader — A minimal header bar for Simple UI mode.
 * Contains: model selector, New Chat button, history toggle, Advanced switch.
 */

import { Plus, PanelLeft, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { UiLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface Props {
  models: string[];
  activeModel: string;
  isGenerating: boolean;
  modelOptionLabels?: Record<string, string>;
  activeModelRateMultiplierLabel?: string | null;
  onModelChange: (model: string) => void;
  onRetryModels: () => void;
  onNewChat: () => void;
  onSwitchToAdvanced: () => void;
  onToggleHistory: () => void;
  historyToggleButtonRef?: RefObject<HTMLButtonElement | null>;
  showHistory: boolean;
  language: UiLanguage;
  quotaUsageRatePercent?: number | null;
  quotaUsageRatio?: string | null;
  localServerUrl?: string | null;
}

export function SimpleHeader({
  models,
  activeModel,
  isGenerating,
  modelOptionLabels,
  activeModelRateMultiplierLabel,
  onModelChange,
  onRetryModels,
  onNewChat,
  onSwitchToAdvanced,
  onToggleHistory,
  historyToggleButtonRef,
  showHistory,
  language,
  quotaUsageRatePercent,
  quotaUsageRatio,
  localServerUrl,
}: Props) {
  const hasModels = models.length > 0;
  const [localUrlCopied, setLocalUrlCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const copyLocalServerUrl = useCallback(() => {
    if (!localServerUrl) return;
    const writeText =
      typeof navigator !== "undefined" && navigator.clipboard
        ? navigator.clipboard.writeText.bind(navigator.clipboard)
        : undefined;
    if (!writeText) return;
    void writeText(localServerUrl)
      .then(() => {
        setLocalUrlCopied(true);
        if (copyTimerRef.current != null) {
          window.clearTimeout(copyTimerRef.current);
        }
        copyTimerRef.current = window.setTimeout(() => {
          setLocalUrlCopied(false);
          copyTimerRef.current = null;
        }, 1200);
      })
      .catch(() => undefined);
  }, [localServerUrl]);

  return (
    <header className="flex items-center h-14 px-3.5 gap-2.5 border-b border-surface-dark-2 bg-surface-dark-1/80 backdrop-blur-sm shrink-0">
      {/* History toggle */}
      {showHistory ? (
        <button
          ref={historyToggleButtonRef}
          type="button"
          onClick={onToggleHistory}
          aria-expanded="true"
          aria-haspopup="dialog"
          className="p-1.5 rounded-lg transition-colors bg-brand-600/20 text-brand-400"
          title={t(language, "conversations")}
          aria-label={t(language, "conversations")}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      ) : (
        <button
          ref={historyToggleButtonRef}
          type="button"
          onClick={onToggleHistory}
          aria-expanded="false"
          aria-haspopup="dialog"
          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-200 hover:bg-surface-dark-2"
          title={t(language, "conversations")}
          aria-label={t(language, "conversations")}
        >
          <PanelLeft className="w-4 h-4" />
        </button>
      )}

      {/* Model selector */}
      <select
        value={hasModels ? activeModel : ""}
        onChange={(e) => onModelChange(e.target.value)}
        disabled={!hasModels}
        className="bg-surface-dark-2 text-[13px] font-medium text-gray-100 rounded-lg px-2.5 py-1.5 border border-surface-dark-3 focus:border-brand-500 focus:outline-none min-w-0 max-w-[230px] truncate"
        title={t(language, "modelSelector")}
        aria-label={t(language, "modelSelector")}
      >
        {hasModels ? (
          models.map((model) => (
            <option key={model} value={model}>
              {modelOptionLabels?.[model] ?? model}
            </option>
          ))
        ) : (
          <option value="">{t(language, "modelsUnavailable")}</option>
        )}
      </select>

      {!hasModels && (
        <button
          type="button"
          onClick={onRetryModels}
          className="text-xs whitespace-nowrap rounded-md px-2.5 py-1 bg-surface-dark-2 border border-surface-dark-3 text-gray-200 hover:bg-surface-dark-3"
        >
          {t(language, "retryModelLoad")}
        </button>
      )}

      <span className="hidden md:inline-flex items-center text-[13px] whitespace-nowrap rounded-md px-2.5 py-1 bg-surface-dark-3 border border-surface-dark-4 text-gray-100 font-medium">
        {t(language, "modelRateMultiplier")}:{" "}
        <strong className="ml-1 font-semibold text-white">
          {activeModelRateMultiplierLabel ?? "—"}
        </strong>
      </span>

      {localServerUrl && (
        <button
          type="button"
          onClick={copyLocalServerUrl}
          className="text-[12px] whitespace-nowrap rounded-md px-2.5 py-1 max-w-[360px] truncate bg-surface-dark-3 border border-surface-dark-4 text-gray-100 hover:text-white hover:bg-surface-dark-4"
          title={`${t(language, "copy")}: ${localServerUrl}`}
          aria-label={`${t(language, "localServerUrl")}: ${localServerUrl}`}
        >
          {localUrlCopied
            ? t(language, "copied")
            : `${t(language, "localServerUrl")}: ${localServerUrl}`}
        </button>
      )}

      <span className="hidden md:inline-flex items-center text-[13px] whitespace-nowrap rounded-md px-2.5 py-1 bg-surface-dark-3 border border-surface-dark-4 text-gray-100 font-medium">
        {t(language, "quotaUsageRate")}:{" "}
        <strong className="ml-1 font-semibold text-white">
          {quotaUsageRatePercent == null
            ? "—"
            : `${quotaUsageRatePercent}%${quotaUsageRatio ? ` (${quotaUsageRatio})` : ""}`}
        </strong>
      </span>

      <div className="flex-1" />

      {/* New Chat */}
      <button
        data-action="new-chat"
        type="button"
        onClick={onNewChat}
        disabled={isGenerating}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-600"
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
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg text-gray-200 hover:text-white bg-surface-dark-2 border border-surface-dark-3 hover:border-brand-500/40 transition-colors"
        title={t(language, "switchToAdvanced")}
        aria-label={t(language, "switchToAdvanced")}
      >
        <Settings2 className="w-4 h-4" />
        {t(language, "advancedMode")}
      </button>
    </header>
  );
}
