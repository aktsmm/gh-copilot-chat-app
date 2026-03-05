/**
 * CodeBlock — Syntax-highlighted code with copy button.
 */

import { useState, useCallback } from "react";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import { Copy, Check } from "lucide-react";
import type { UiLanguage } from "../lib/types";
import { t } from "../lib/i18n";
import { useChatStore } from "../lib/store";

SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);
SyntaxHighlighter.registerLanguage("html", markup);
SyntaxHighlighter.registerLanguage("xml", markup);
SyntaxHighlighter.registerLanguage("css", css);

interface Props {
  language: string;
  code: string;
  uiLanguage: UiLanguage;
}

export function CodeBlock({ language, code, uiLanguage }: Props) {
  const [copied, setCopied] = useState(false);
  const { themeMode } = useChatStore();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [code]);

  return (
    <div className="relative group my-3 not-prose">
      {/* Language label + copy */}
      <div className="flex items-center justify-between bg-surface-dark-0 border border-surface-dark-3 border-b-0 rounded-t-xl px-4 py-1.5">
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
          {language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          title={t(uiLanguage, "copyCode")}
          aria-label={t(uiLanguage, "copyCode")}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />{" "}
              {t(uiLanguage, "copied")}
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" /> {t(uiLanguage, "copy")}
            </>
          )}
        </button>
      </div>

      <SyntaxHighlighter
        language={language}
        style={themeMode === "light" ? oneLight : oneDark}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 0.75rem 0.75rem",
          border: `1px solid ${themeMode === "light" ? "#e5e7eb" : "#303036"}`,
          borderTop: "none",
          fontSize: "0.8rem",
        }}
        showLineNumbers
        lineNumberStyle={{
          color: themeMode === "light" ? "#9ca3af" : "#3f3f46",
          fontSize: "0.7rem",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
