/**
 * WelcomeScreen — Shown when no conversation is selected.
 */

import { Sparkles, Zap, Code2, Globe, Brain } from "lucide-react";
import type { UiLanguage } from "../lib/types";
import { t } from "../lib/i18n";

interface Props {
  language: UiLanguage;
  displayName: string;
  models: string[];
  onNewChat: (model?: string) => void;
  onQuickPrompt: (prompt: string) => void;
}

function modelDescription(model: string, language: UiLanguage): string {
  const lower = model.toLowerCase();
  if (lower.includes("gpt-5"))
    return language === "ja" ? "最新世代" : "Latest generation";
  if (lower.includes("o3"))
    return language === "ja" ? "推論特化" : "Reasoning focused";
  if (lower.includes("claude"))
    return language === "ja" ? "長文・分析" : "Long context & analysis";
  return language === "ja" ? "汎用" : "General purpose";
}

export function WelcomeScreen({
  language,
  displayName,
  models,
  onNewChat,
  onQuickPrompt,
}: Props) {
  const quickPrompts = [
    {
      icon: Code2,
      title: t(language, "writeCode"),
      prompt:
        language === "ja"
          ? "TypeScriptで使い回せるユーティリティ関数を設計してください。"
          : "Help me design a reusable TypeScript utility function.",
    },
    {
      icon: Globe,
      title: t(language, "explainConcept"),
      prompt:
        language === "ja"
          ? "技術の基本概念を初心者向けに説明してください。"
          : "Explain a core concept for a beginner.",
    },
    {
      icon: Brain,
      title: t(language, "debugIssue"),
      prompt:
        language === "ja"
          ? "エラーの原因候補と調査手順を教えてください。"
          : "Help me identify likely causes and debugging steps for an error.",
    },
    {
      icon: Zap,
      title: t(language, "reviewCode"),
      prompt:
        language === "ja"
          ? "コードや要件を共有するので、品質と保守性の観点でレビューしてください。"
          : "I’ll share code or requirements; review them for quality and maintainability.",
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 animate-fade-in">
      {/* Hero */}
      <p className="text-sm text-gray-400 mb-2">
        {language === "ja"
          ? `${displayName}さん、おかえりなさい。`
          : `Welcome back, ${displayName}.`}
      </p>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-xl shadow-brand-500/20">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-gray-100 mb-1">
        {t(language, "appTitle")}
      </h1>
      <p className="text-sm text-gray-500 mb-10 text-center max-w-md">
        {t(language, "welcomeSubtitle")}
      </p>

      {/* Model selector */}
      <div className="flex flex-wrap gap-3 mb-10 justify-center">
        <div className="w-full text-center text-xs text-gray-500 mb-1">
          {t(language, "pickModel")}
        </div>
        {models.slice(0, 6).map((model) => (
          <button
            key={model}
            onClick={() => onNewChat(model)}
            className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl
              bg-surface-dark-2 border border-surface-dark-3
              hover:border-brand-500/50 hover:bg-surface-dark-3 transition-all group"
          >
            <span className="text-sm font-semibold text-gray-200 group-hover:text-white">
              {model}
            </span>
            <span className="text-[10px] text-gray-500">
              {modelDescription(model, language)}
            </span>
          </button>
        ))}
      </div>

      {/* Quick prompts */}
      <div className="w-full max-w-lg text-left text-xs text-gray-500 mb-2">
        {t(language, "quickPrompts")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
        {quickPrompts.map((qp) => (
          <button
            key={qp.title}
            onClick={() => onQuickPrompt(qp.prompt)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl
              bg-surface-dark-1 border border-surface-dark-3
              hover:border-surface-dark-4 hover:bg-surface-dark-2 transition-all text-left group"
          >
            <qp.icon className="w-4 h-4 text-gray-500 group-hover:text-brand-400 flex-shrink-0" />
            <div>
              <div className="text-xs font-medium text-gray-300 group-hover:text-white">
                {qp.title}
              </div>
              <div className="text-[10px] text-gray-600 truncate">
                {qp.prompt}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
