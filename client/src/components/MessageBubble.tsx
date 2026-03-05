/**
 * MessageBubble — Renders a single chat message.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, UiLanguage } from "../lib/types";
import { User, Bot, AlertTriangle } from "lucide-react";
import { t } from "../lib/i18n";

const MarkdownContent = lazy(() =>
  import("./MarkdownContent").then((module) => ({
    default: module.MarkdownContent,
  })),
);

interface Props {
  message: ChatMessage;
  language: UiLanguage;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\))/g, "");
}

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[)\]}>'`。、，．！？!?:;」』）】＞》〉]+$/gu, "");
}

function toArtifactUrl(candidate: string): string | null {
  const sanitized = trimTrailingUrlPunctuation(stripAnsi(candidate).trim());
  if (!/^https?:\/\/\S+$/i.test(sanitized)) {
    return null;
  }
  return sanitized;
}

function isLikelyArtifactPath(candidate: string): boolean {
  const sanitized = trimTrailingUrlPunctuation(stripAnsi(candidate).trim());
  if (!sanitized) return false;

  if (
    sanitized.startsWith("./") ||
    sanitized.startsWith("../") ||
    sanitized.startsWith("/")
  ) {
    return true;
  }

  return /(^|\/)\S+\.\S+$/.test(sanitized);
}

function extractArtifacts(content: string): {
  urls: string[];
  paths: string[];
} {
  const normalizedContent = stripAnsi(content);

  const urls = unique(
    (normalizedContent.match(/https?:\/\/[^\s<>()"']+/gi) ?? [])
      .map(toArtifactUrl)
      .filter((url): url is string => Boolean(url)),
  ).slice(0, 6);

  const windowsPaths = normalizedContent.match(/[A-Za-z]:\\[^\s<>"'`]+/g) ?? [];

  const relativePathMatches: string[] = [];
  const relativePathPattern =
    /(?:^|[\s(])((?:\.{1,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/g;
  let match: RegExpExecArray | null;
  while ((match = relativePathPattern.exec(normalizedContent)) !== null) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
      continue;
    }
    if (candidate.startsWith("/api") || candidate.startsWith("/socket.io")) {
      continue;
    }
    if (!isLikelyArtifactPath(candidate)) {
      continue;
    }
    relativePathMatches.push(candidate);
  }

  const paths = unique([...windowsPaths, ...relativePathMatches]).slice(0, 6);

  return { urls, paths };
}

export function MessageBubble({ message, language }: Props) {
  const { role, content } = message;
  const [messageCopyState, setMessageCopyState] = useState<
    "idle" | "ok" | "error"
  >("idle");
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const updateCopyState = (next: "ok" | "error") => {
    setMessageCopyState(next);
    if (copyTimerRef.current != null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setMessageCopyState("idle");
      copyTimerRef.current = null;
    }, 1200);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      updateCopyState("ok");
    } catch {
      updateCopyState("error");
    }
  };
  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {}
  };
  const artifacts = useMemo(
    () => (role === "assistant" ? extractArtifacts(content) : null),
    [role, content],
  );

  if (role === "system") {
    return (
      <div className="flex items-start gap-2 text-amber-400/80 text-xs py-2 animate-fade-in">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>{content}</span>
      </div>
    );
  }

  const isUser = role === "user";

  return (
    <div
      className={`flex gap-3 animate-slide-up ${isUser ? "flex-row-reverse" : ""}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center
          ${isUser ? "bg-brand-600" : "bg-surface-dark-3"}`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-brand-400" />
        )}
      </div>

      {/* Bubble */}
      <div className={`msg-bubble ${isUser ? "msg-user" : "msg-assistant"}`}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{content}</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <div>
                {message.source === "web-search-fallback" && (
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full border border-amber-600/30 bg-amber-900/20 text-amber-300"
                    title={
                      message.sourceModel
                        ? `${t(language, "modelSelector")}: ${message.sourceModel}`
                        : t(language, "fallbackResponseBadge")
                    }
                  >
                    <span>{t(language, "fallbackResponseBadge")}</span>
                    {message.sourceModel && (
                      <span className="text-amber-100 font-semibold">
                        {` · ${message.sourceModel}`}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <button
                onClick={handleCopy}
                className="text-[10px] px-2 py-0.5 rounded-md bg-surface-dark-3 text-gray-300 hover:text-white"
                title={t(language, "copy")}
                aria-label={t(language, "copy")}
              >
                {messageCopyState === "ok"
                  ? t(language, "copied")
                  : messageCopyState === "error"
                    ? t(language, "copyFailed")
                    : t(language, "copy")}
              </button>
            </div>
            <Suspense
              fallback={
                <p className="text-sm whitespace-pre-wrap">{content}</p>
              }
            >
              <MarkdownContent content={content} language={language} />
            </Suspense>
            {artifacts &&
              (artifacts.urls.length > 0 || artifacts.paths.length > 0) && (
                <div className="mt-2 space-y-2 border-t border-surface-dark-3 pt-2">
                  {artifacts.urls.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500">
                        {t(language, "artifactLinks")}
                      </div>
                      {artifacts.urls.map((url) => (
                        <div key={url} className="flex items-center gap-1.5">
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 text-[11px] text-brand-300 hover:text-brand-200 truncate"
                            title={url}
                          >
                            {url}
                          </a>
                          <button
                            onClick={() => void copyText(url)}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-surface-dark-3 text-gray-300 hover:text-white"
                            aria-label={`${t(language, "copy")}: ${url}`}
                          >
                            {t(language, "copy")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {artifacts.paths.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-500">
                        {t(language, "artifactPaths")}
                      </div>
                      {artifacts.paths.map((artifactPath) => (
                        <div
                          key={artifactPath}
                          className="flex items-center gap-1.5"
                        >
                          <span
                            className="flex-1 text-[11px] text-gray-300 truncate"
                            title={artifactPath}
                          >
                            {artifactPath}
                          </span>
                          <button
                            onClick={() => void copyText(artifactPath)}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-surface-dark-3 text-gray-300 hover:text-white"
                            aria-label={`${t(language, "copy")}: ${artifactPath}`}
                          >
                            {t(language, "copy")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}
