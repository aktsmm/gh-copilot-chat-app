/**
 * StreamingBubble — Shows the in-progress assistant response with markdown rendering.
 */

import { lazy, Suspense } from "react";
import { Bot } from "lucide-react";
import type { UiLanguage } from "../lib/types";

const MarkdownContent = lazy(() =>
  import("./MarkdownContent").then((module) => ({
    default: module.MarkdownContent,
  })),
);

interface Props {
  content: string;
  language: UiLanguage;
}

function sanitizeStreamingContent(content: string): string {
  return content
    .replace(/⚠️\s*このアシスタントはコーディングツールです。?/g, "")
    .replace(/このアシスタントはコーディングツールです。?/g, "")
    .replace(
      /ニュース情報は\s*Google\s*ニュース\s*RSS\s*から取得しており、詳細はリンク先でご確認ください。?/g,
      "",
    )
    .replace(/⚠️\s*This assistant is a coding tool\.?/gi, "")
    .replace(/This assistant is a coding tool\.?/gi, "")
    .replace(/News information is sourced from Google News RSS[^\n]*\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function StreamingBubble({ content, language }: Props) {
  const sanitizedContent = sanitizeStreamingContent(content);

  return (
    <div className="flex gap-3 animate-fade-in">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-surface-dark-3">
        <Bot className="w-4 h-4 text-brand-400" />
      </div>

      {/* Bubble */}
      <div className="msg-bubble msg-assistant">
        <Suspense
          fallback={
            <p className="text-sm whitespace-pre-wrap">{sanitizedContent}</p>
          }
        >
          <MarkdownContent content={sanitizedContent} language={language} />
        </Suspense>
        {/* Blinking cursor */}
        <span className="inline-block w-1.5 h-4 bg-brand-400 ml-0.5 animate-pulse rounded-sm align-text-bottom" />
      </div>
    </div>
  );
}
