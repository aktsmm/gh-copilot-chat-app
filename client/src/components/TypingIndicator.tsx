/**
 * TypingIndicator — Three animated dots shown while waiting for the first token.
 */

export function TypingIndicator() {
  return (
    <div className="flex gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-surface-dark-3">
        <svg
          className="w-4 h-4 text-brand-400"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </div>
      <div className="msg-bubble msg-assistant flex items-center gap-1.5 py-4">
        <div className="typing-dot" />
        <div className="typing-dot" />
        <div className="typing-dot" />
      </div>
    </div>
  );
}
