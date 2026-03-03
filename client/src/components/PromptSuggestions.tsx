/**
 * PromptSuggestions — Contextual prompt suggestion chips.
 *
 * Displayed when:
 *  - A conversation has 0 user messages (just started)
 *  - OR after the first assistant reply (follow-up suggestions)
 *
 * Suggestions are randomly sampled from a curated pool so they feel fresh every time.
 */

import { useMemo } from "react";
import {
  Code2,
  Globe,
  Brain,
  Zap,
  FileText,
  Lightbulb,
  BarChart3,
  PenTool,
  BookOpen,
  Wrench,
} from "lucide-react";
import type { UiLanguage } from "../lib/types";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Suggestion pool                                                     */
/* ------------------------------------------------------------------ */

interface Suggestion {
  icon: LucideIcon;
  label: { ja: string; en: string };
  prompt: { ja: string; en: string };
  category: "code" | "writing" | "analysis" | "learning" | "tools";
}

const SUGGESTIONS: Suggestion[] = [
  // -- Code --
  {
    icon: Code2,
    label: { ja: "コードを書く", en: "Write code" },
    prompt: {
      ja: "TypeScriptで再利用可能なユーティリティ関数を作ってください。",
      en: "Help me write a reusable TypeScript utility function.",
    },
    category: "code",
  },
  {
    icon: Wrench,
    label: { ja: "バグを直す", en: "Fix a bug" },
    prompt: {
      ja: "エラーの原因と修正案を教えてください。",
      en: "Help me identify likely causes of an error and suggest a fix.",
    },
    category: "code",
  },
  {
    icon: Zap,
    label: { ja: "コードレビュー", en: "Code review" },
    prompt: {
      ja: "コードや要件を共有するので、品質・パフォーマンス・保守性の観点でレビューしてください。",
      en: "I’ll share code or requirements; review them for quality, performance, and maintainability.",
    },
    category: "code",
  },
  {
    icon: Code2,
    label: { ja: "リファクタリング", en: "Refactor" },
    prompt: {
      ja: "対象実装をよりクリーンにするための段階的なリファクタリング計画を作ってください。",
      en: "Create a step-by-step refactoring plan to make the target implementation cleaner and more maintainable.",
    },
    category: "code",
  },
  {
    icon: Code2,
    label: { ja: "テストを書く", en: "Write tests" },
    prompt: {
      ja: "対象ロジックのユニットテスト観点とテストケースを作成してください。",
      en: "Create unit-test perspectives and test cases for the target logic.",
    },
    category: "code",
  },
  // -- Writing --
  {
    icon: PenTool,
    label: { ja: "文章を書く", en: "Write text" },
    prompt: {
      ja: "以下の内容をわかりやすく文章にまとめてください。",
      en: "Help me write a clear and concise document about the following.",
    },
    category: "writing",
  },
  {
    icon: FileText,
    label: { ja: "要約する", en: "Summarize" },
    prompt: {
      ja: "文章を簡潔に要約してください。",
      en: "Summarize text concisely.",
    },
    category: "writing",
  },
  {
    icon: PenTool,
    label: { ja: "メールを作成", en: "Draft an email" },
    prompt: {
      ja: "以下の要件でプロフェッショナルなメールを作成してください。",
      en: "Draft a professional email for the following purpose.",
    },
    category: "writing",
  },
  // -- Analysis --
  {
    icon: BarChart3,
    label: { ja: "データ分析", en: "Analyze data" },
    prompt: {
      ja: "データの傾向とインサイトを分析してください。",
      en: "Analyze trends and insights in data.",
    },
    category: "analysis",
  },
  {
    icon: Brain,
    label: { ja: "比較する", en: "Compare options" },
    prompt: {
      ja: "以下の選択肢のメリット・デメリットを比較してください。",
      en: "Compare the pros and cons of these options.",
    },
    category: "analysis",
  },
  {
    icon: Brain,
    label: { ja: "アイデア出し", en: "Brainstorm" },
    prompt: {
      ja: "テーマについてアイデアをブレインストーミングしてください。",
      en: "Help me brainstorm ideas about a topic.",
    },
    category: "analysis",
  },
  // -- Learning --
  {
    icon: Globe,
    label: { ja: "概念を説明", en: "Explain a concept" },
    prompt: {
      ja: "技術の基本概念を初心者にもわかるように説明してください。",
      en: "Explain a concept in a way that a beginner can understand.",
    },
    category: "learning",
  },
  {
    icon: BookOpen,
    label: { ja: "チュートリアル", en: "Tutorial" },
    prompt: {
      ja: "これのステップバイステップのチュートリアルを教えてください。",
      en: "Give me a step-by-step tutorial.",
    },
    category: "learning",
  },
  {
    icon: Lightbulb,
    label: { ja: "ベストプラクティス", en: "Best practices" },
    prompt: {
      ja: "テーマのベストプラクティスを教えてください。",
      en: "What are the best practices for a topic?",
    },
    category: "learning",
  },
  // -- Tools / practical --
  {
    icon: Wrench,
    label: { ja: "正規表現を作成", en: "Build a regex" },
    prompt: {
      ja: "以下の条件にマッチする正規表現を作ってください。",
      en: "Create a regular expression that matches the following pattern.",
    },
    category: "tools",
  },
  {
    icon: FileText,
    label: { ja: "JSON/YAML変換", en: "Convert JSON/YAML" },
    prompt: {
      ja: "JSONをYAMLに変換してください。",
      en: "Convert JSON to YAML.",
    },
    category: "tools",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Pick `count` random items from an array (Fisher-Yates sample). */
function sampleN<T>(arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const result: T[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(Math.random() * (pool.length - i)) + i;
    [pool[i], pool[idx]] = [pool[idx], pool[i]];
    result.push(pool[i]);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  language: UiLanguage;
  onSelect: (prompt: string) => void;
  /** Number of suggestion chips to show (default 4) */
  count?: number;
  /** Compact styling — used inside chat area */
  compact?: boolean;
}

export function PromptSuggestions({
  language,
  onSelect,
  count = 4,
  compact = false,
}: Props) {
  // Memoize a random sample so it stays stable during the component's lifetime
  // but refreshes when the component re-mounts (new conversation)
  const suggestions = useMemo(() => sampleN(SUGGESTIONS, count), [count]);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 animate-fade-in">
        {suggestions.map((s) => (
          <button
            key={s.label.en}
            onClick={() => onSelect(s.prompt[language])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs
              bg-surface-dark-2 border border-surface-dark-3
              hover:border-brand-500/40 hover:bg-surface-dark-3
              text-gray-300 hover:text-white
              rounded-full transition-all"
          >
            <s.icon className="w-3 h-3 text-gray-500" />
            {s.label[language]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 animate-fade-in">
      {suggestions.map((s) => (
        <button
          key={s.label.en}
          onClick={() => onSelect(s.prompt[language])}
          className="flex items-center gap-3 px-4 py-3 rounded-xl
            bg-surface-dark-1 border border-surface-dark-3
            hover:border-brand-500/30 hover:bg-surface-dark-2
            transition-all text-left group"
        >
          <s.icon className="w-4 h-4 text-gray-500 group-hover:text-brand-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-medium text-gray-300 group-hover:text-white">
              {s.label[language]}
            </div>
            <div className="text-[10px] text-gray-600 truncate">
              {s.prompt[language]}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
