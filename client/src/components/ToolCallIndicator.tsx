/**
 * ToolCallIndicator — Shows when the AI is invoking a tool.
 */

import { Loader2, CheckCircle2, Wrench } from "lucide-react";
import type { ToolCall } from "../lib/types";

interface Props {
  tool: ToolCall;
}

export function ToolCallIndicator({ tool }: Props) {
  const isRunning = tool.status === "running";

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 py-1 px-3 animate-fade-in">
      <div className="flex items-center gap-1.5 bg-surface-dark-2 rounded-lg px-3 py-1.5 border border-surface-dark-3">
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        )}
        <Wrench className="w-3 h-3 text-gray-500" />
        <span className="font-mono text-gray-300">{tool.name}</span>
        {isRunning && <span className="text-gray-500">running…</span>}
      </div>
    </div>
  );
}
