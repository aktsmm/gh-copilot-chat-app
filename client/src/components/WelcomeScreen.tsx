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
  onRetryModels: () => void;
  onNewChat: (model?: string) => void;
  onQuickPrompt: (prompt: string) => void;
}

function resolveVendor(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("claude")) return "anthropic";
  if (
    lower.startsWith("gpt") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4")
  ) {
    return "openai";
  }
  if (lower.startsWith("gemini")) return "google";
  if (lower.startsWith("deepseek")) return "deepseek";
  if (lower.startsWith("qwen")) return "qwen";
  if (lower.startsWith("mistral")) return "mistral";

  const first = lower.split(/[-_/]/)[0];
  return first || "other";
}

function parseVersionParts(modelId: string): number[] {
  const parts = modelId.toLowerCase().split("-");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const token = parts[index];
    if (/^\d+(?:\.\d+)*$/.test(token)) {
      return token.split(".").map((segment) => Number(segment));
    }
  }
  return [];
}

function compareVersionParts(left: number[], right: number[]): number {
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  return 0;
}

function resolveFamilyKey(modelId: string): string {
  const parts = modelId.toLowerCase().split("-");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/^\d+(?:\.\d+)*$/.test(parts[index])) {
      return parts.slice(0, index).join("-") || modelId.toLowerCase();
    }
  }
  return modelId.toLowerCase();
}

function buildSuggestedModels(models: string[], maxCount = 6): string[] {
  if (models.length <= 1) return models;

  const latestByFamily = new Map<
    string,
    {
      id: string;
      vendor: string;
      version: number[];
      order: number;
    }
  >();

  models.forEach((model, order) => {
    const familyKey = resolveFamilyKey(model);
    const nextVersion = parseVersionParts(model);
    const current = latestByFamily.get(familyKey);
    if (!current) {
      latestByFamily.set(familyKey, {
        id: model,
        vendor: resolveVendor(model),
        version: nextVersion,
        order,
      });
      return;
    }

    const versionDiff = compareVersionParts(nextVersion, current.version);
    if (
      versionDiff > 0 ||
      (versionDiff === 0 && model.length < current.id.length)
    ) {
      latestByFamily.set(familyKey, {
        id: model,
        vendor: resolveVendor(model),
        version: nextVersion,
        order: current.order,
      });
    }
  });

  const deduped = [...latestByFamily.values()].sort(
    (left, right) => left.order - right.order,
  );

  const vendorOrder: string[] = [];
  const byVendor = new Map<string, string[]>();
  deduped.forEach((item) => {
    if (!byVendor.has(item.vendor)) {
      byVendor.set(item.vendor, []);
      vendorOrder.push(item.vendor);
    }
    byVendor.get(item.vendor)?.push(item.id);
  });

  const result: string[] = [];
  while (result.length < maxCount) {
    let pickedInRound = false;
    for (const vendor of vendorOrder) {
      const queue = byVendor.get(vendor);
      if (!queue || queue.length === 0) continue;
      const candidate = queue.shift();
      if (!candidate) continue;
      result.push(candidate);
      pickedInRound = true;
      if (result.length >= maxCount) break;
    }
    if (!pickedInRound) break;
  }

  return result;
}

export function WelcomeScreen({
  language,
  displayName,
  models,
  onRetryModels,
  onNewChat,
  onQuickPrompt,
}: Props) {
  const suggestedModels = buildSuggestedModels(models, 6);

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
        {models.length === 0 ? (
          <div className="w-full max-w-lg rounded-xl border border-surface-dark-3 bg-surface-dark-1 px-4 py-4 text-center space-y-2">
            <p className="text-sm text-gray-300">
              {t(language, "modelsUnavailable")}
            </p>
            <button
              type="button"
              onClick={onRetryModels}
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-xs bg-surface-dark-2 border border-surface-dark-3 text-gray-200 hover:bg-surface-dark-3"
            >
              {t(language, "retryModelLoad")}
            </button>
          </div>
        ) : (
          suggestedModels.map((model) => (
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
            </button>
          ))
        )}
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
