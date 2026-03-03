/** Shared type definitions for the chat UI */

export type UiLanguage = "ja" | "en";
export type ThemeMode = "dark" | "light";
export type UiMode = "simple" | "advanced";
export type AgentMode = "interactive" | "plan" | "autopilot";
export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type PreferredReasoningEffort = ReasoningEffort | "auto";

export interface UserProfile {
  displayName: string;
  headline?: string;
}

export type ChatMessageSource = "default" | "web-search-fallback";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  source?: ChatMessageSource;
  sourceModel?: string;
  /** Tool calls that happened during this message's generation */
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id?: string;
  name: string;
  status: "running" | "done";
  output?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  mode?: AgentMode;
  reasoningEffort?: ReasoningEffort;
  availableTools?: string[];
  excludedTools?: string[];
  createdAt: number;
  lastUsed: number;
  messages: ChatMessage[];
}

export interface ModelInfoLite {
  id: string;
  name: string;
  reasoningSupported: boolean;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
  rateMultiplier?: number;
}

export interface ToolInfoLite {
  name: string;
  namespacedName?: string;
  description: string;
  category: string;
}

export interface QuotaSnapshot {
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: number;
  overageAllowedWithExhaustedQuota: boolean;
  resetDate?: string;
}

export interface ServerStatus {
  state: string;
  sessions: number;
}

export interface SkillTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  recommendedModel?: string;
}
