/**
 * SimpleToolIndicator — A compact one-line indicator for tool execution.
 * Used in Simple UI mode to replace the detailed ToolCallIndicator.
 */

import type { ToolCall, UiLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface Props {
  tools: ToolCall[];
  language: UiLanguage;
}

export function SimpleToolIndicator({ tools, language }: Props) {
  if (tools.length === 0) return null;

  const label =
    tools.length === 1
      ? t(language, "toolRunning")
      : t(language, "toolsRunning").replace("{count}", String(tools.length));

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 py-2 px-3 text-xs text-gray-400 animate-pulse"
    >
      <span className="inline-block w-2 h-2 rounded-full bg-brand-500 animate-ping" />
      <span>{label}</span>
    </div>
  );
}
