import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import type { UiLanguage } from "../lib/types";

interface Props {
  content: string;
  language: UiLanguage;
}

function isSafeExternalHref(href: string): boolean {
  try {
    const parsed = new URL(href);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function MarkdownContent({ content, language }: Props) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            if (typeof href !== "string" || !isSafeExternalHref(href)) {
              return <span>{children}</span>;
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                {...props}
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /(?:^|\s)language-([a-z0-9_+-]+)/i.exec(
              className ?? "",
            );
            const codeText = String(children);
            const isBlock = codeText.includes("\n");
            const normalizedLanguage =
              (match?.[1]?.toLowerCase() ?? "text") === "shell"
                ? "bash"
                : (match?.[1]?.toLowerCase() ?? "text");
            if (match || isBlock) {
              return (
                <CodeBlock
                  language={normalizedLanguage}
                  code={codeText.replace(/\n$/, "")}
                  uiLanguage={language}
                />
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
