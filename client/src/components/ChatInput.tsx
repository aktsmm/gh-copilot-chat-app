/**
 * ChatInput — Composer with auto-resize textarea, send / stop button, keyboard shortcuts.
 */

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { Send, Square, Mic, MicOff, FlaskConical } from "lucide-react";
import type { UiLanguage } from "../lib/types";
import { languageToSpeechCode, t } from "../lib/i18n";

const PROMPT_HISTORY_KEY = "ghc-prompt-history-v1";
const PROMPT_HISTORY_LIMIT = 50;

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionType = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionType;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface Props {
  onSend: (prompt: string) => void;
  onAbort: () => void;
  isGenerating: boolean;
  disabled: boolean;
  language: UiLanguage;
  researchMode: boolean;
  onToggleResearch?: () => void;
  researchAvailable?: boolean;
}

export function ChatInput({
  onSend,
  onAbort,
  isGenerating,
  disabled,
  language,
  researchMode,
  onToggleResearch,
  researchAvailable = true,
}: Props) {
  const [value, setValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(PROMPT_HISTORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, PROMPT_HISTORY_LIMIT);
      setPromptHistory(normalized);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        PROMPT_HISTORY_KEY,
        JSON.stringify(promptHistory.slice(0, PROMPT_HISTORY_LIMIT)),
      );
    } catch {}
  }, [promptHistory]);

  const stopVoiceInput = useCallback(() => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    }
    recognitionRef.current = null;
    setIsListening(false);
    setVoiceStatus(t(language, "ready"));
  }, [language]);

  const startVoiceInput = useCallback(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageToSpeechCode(language);

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0]?.transcript ?? "";
        }
      }

      if (finalText.trim()) {
        setValue((prev) => `${prev}${prev ? " " : ""}${finalText.trim()}`);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const isPermissionDenied =
        event?.error === "not-allowed" ||
        event?.error === "service-not-allowed";
      setVoiceStatus(
        isPermissionDenied
          ? t(language, "voicePermissionDenied")
          : t(language, "voiceInputError"),
      );
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      setVoiceStatus(t(language, "ready"));
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceStatus(t(language, "voiceListening"));
  }, [language]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
    const SpeechRecognitionCtor =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(SpeechRecognitionCtor));

    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const handleSend = useCallback(() => {
    if (isGenerating) {
      onAbort();
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (isListening) {
      stopVoiceInput();
    }
    setVoiceStatus(null);
    setPromptHistory((current) => {
      const next = [
        trimmed,
        ...current.filter((item) => item !== trimmed),
      ].slice(0, PROMPT_HISTORY_LIMIT);
      return next;
    });
    setHistoryIndex(-1);
    setHistoryDraft("");
    onSend(trimmed);
    setValue("");
    // Reset height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [
    value,
    isGenerating,
    disabled,
    isListening,
    onSend,
    onAbort,
    stopVoiceInput,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;

      if (e.key === "ArrowUp" && !e.shiftKey) {
        const canUseHistory = value.trim().length === 0 || historyIndex >= 0;
        if (!canUseHistory || promptHistory.length === 0) return;
        e.preventDefault();

        const nextIndex =
          historyIndex < 0
            ? 0
            : Math.min(historyIndex + 1, promptHistory.length - 1);

        if (historyIndex < 0) {
          setHistoryDraft(value);
        }

        setHistoryIndex(nextIndex);
        setValue(promptHistory[nextIndex] ?? value);
        return;
      }

      if (e.key === "ArrowDown" && !e.shiftKey) {
        if (historyIndex < 0) return;
        e.preventDefault();

        const nextIndex = historyIndex - 1;
        if (nextIndex < 0) {
          setHistoryIndex(-1);
          setValue(historyDraft);
          return;
        }

        setHistoryIndex(nextIndex);
        setValue(promptHistory[nextIndex] ?? historyDraft);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, historyDraft, historyIndex, promptHistory, value],
  );

  const toggleVoiceInput = useCallback(() => {
    if (!voiceSupported) return;
    if (isListening) {
      stopVoiceInput();
      return;
    }
    try {
      startVoiceInput();
    } catch {
      setVoiceStatus(t(language, "voicePermissionDenied"));
    }
  }, [isListening, language, startVoiceInput, stopVoiceInput, voiceSupported]);

  return (
    <div className="border-t border-surface-dark-3 bg-surface-dark-1/50 backdrop-blur-sm px-4 py-3">
      <div className="max-w-4xl mx-auto">
        <div className="relative flex items-end gap-2">
          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t(language, "inputPlaceholder")}
              aria-label={t(language, "inputPlaceholder")}
              rows={1}
              disabled={disabled}
              className="chat-input pr-12 min-h-[44px] max-h-[200px]"
            />
          </div>

          {isListening ? (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={disabled || !voiceSupported}
              aria-label={t(language, "voiceInput")}
              aria-pressed="true"
              className="flex-shrink-0 p-2.5 rounded-xl transition-all bg-brand-600 text-white"
              title={t(language, "voiceInput")}
            >
              <MicOff className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={disabled || !voiceSupported}
              aria-label={t(language, "voiceInput")}
              aria-pressed="false"
              className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
                voiceSupported
                  ? "bg-surface-dark-3 text-gray-300 hover:text-white"
                  : "bg-surface-dark-3 text-gray-600 cursor-not-allowed"
              }`}
              title={t(language, "voiceInput")}
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          {onToggleResearch &&
            (researchMode && researchAvailable ? (
              <button
                type="button"
                onClick={onToggleResearch}
                disabled={disabled || !researchAvailable}
                aria-label={t(language, "researchMode")}
                aria-pressed="true"
                className="flex-shrink-0 p-2.5 rounded-xl transition-all bg-brand-700/30 text-brand-200 border border-brand-600/40"
                title={t(language, "researchMode")}
              >
                <FlaskConical className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onToggleResearch}
                disabled={disabled || !researchAvailable}
                aria-label={t(language, "researchMode")}
                aria-pressed="false"
                className={`flex-shrink-0 p-2.5 rounded-xl transition-all ${
                  researchAvailable
                    ? "bg-surface-dark-3 text-gray-300 hover:text-white"
                    : "bg-surface-dark-3 text-gray-600 cursor-not-allowed"
                }`}
                title={
                  researchAvailable
                    ? t(language, "researchMode")
                    : t(language, "researchUnavailable")
                }
              >
                <FlaskConical className="w-4 h-4" />
              </button>
            ))}

          {/* Send / Stop button */}
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || (!isGenerating && !value.trim())}
            aria-label={
              isGenerating
                ? t(language, "stopGenerating")
                : t(language, "sendMessage")
            }
            className={`flex-shrink-0 p-2.5 rounded-xl transition-all
              ${
                isGenerating
                  ? "bg-red-600 hover:bg-red-500 text-white"
                  : value.trim()
                    ? "bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/20"
                    : "bg-surface-dark-3 text-gray-500 cursor-not-allowed"
              }`}
            title={
              isGenerating
                ? t(language, "stopGenerating")
                : t(language, "sendMessage")
            }
          >
            {isGenerating ? (
              <Square className="w-4 h-4" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Hint */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          <div className="flex items-center gap-1.5">
            {researchMode && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border bg-brand-800/40 border-brand-600/50 text-brand-200">
                {t(language, "researchMode")} ·{" "}
                {t(language, "researchNextSend")}
              </span>
            )}
            {onToggleResearch && !researchAvailable && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border bg-surface-dark-2 border-surface-dark-3 text-gray-400">
                {t(language, "researchUnavailable")}
              </span>
            )}
            <span className="text-[10px] text-gray-600">
              {voiceSupported
                ? isListening
                  ? t(language, "voiceListening")
                  : (voiceStatus ?? t(language, "ready"))
                : t(language, "voiceUnsupported")}
            </span>
          </div>
          <span className="text-[10px] text-gray-600">
            {isGenerating
              ? t(language, "inputHintGenerating")
              : t(language, "inputHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
