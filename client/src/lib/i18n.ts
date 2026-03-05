import type { UiLanguage } from "./types";

export const UI_LANGUAGES: UiLanguage[] = ["ja", "en"];

type I18nKey =
  | "appTitle"
  | "newChat"
  | "newShort"
  | "expandSidebar"
  | "collapseSidebar"
  | "conversationSearch"
  | "conversationSearchPlaceholder"
  | "noConversations"
  | "modelSelector"
  | "agentMode"
  | "modeInteractive"
  | "modePlan"
  | "modeAutopilot"
  | "reasoningEffort"
  | "reasoningAuto"
  | "reasoningLow"
  | "reasoningMedium"
  | "reasoningHigh"
  | "reasoningXHigh"
  | "toolsAvailable"
  | "toolPolicy"
  | "toolCategory"
  | "toolCategoryAll"
  | "toolPolicyAll"
  | "toolPolicyAllow"
  | "toolPolicyExclude"
  | "applyToolPolicy"
  | "noToolsAvailable"
  | "quotaRemaining"
  | "quotaUsageRate"
  | "modelRateMultiplier"
  | "webSearchEnabled"
  | "webSearchDisabled"
  | "compactContext"
  | "skills"
  | "profile"
  | "profileDisplayName"
  | "profileDisplayNamePlaceholder"
  | "profileHeadline"
  | "profileHeadlinePlaceholder"
  | "editProfile"
  | "saveProfile"
  | "cancelProfile"
  | "mcpQuickConnect"
  | "mcpUrlPlaceholder"
  | "mcpConnectByUrl"
  | "skillSearch"
  | "skillSearchPlaceholder"
  | "language"
  | "theme"
  | "themeDark"
  | "themeLight"
  | "langJa"
  | "langEn"
  | "poweredBy"
  | "appVersion"
  | "signature"
  | "repository"
  | "rename"
  | "delete"
  | "renameTitle"
  | "saveRename"
  | "cancelRename"
  | "emptyMessage"
  | "inputPlaceholder"
  | "inputHint"
  | "inputHintGenerating"
  | "sendMessage"
  | "stopGenerating"
  | "researchMode"
  | "researchNextSend"
  | "voiceInput"
  | "voiceUnsupported"
  | "voicePermissionDenied"
  | "voiceInputError"
  | "voiceListening"
  | "copyCode"
  | "copy"
  | "copied"
  | "welcomeSubtitle"
  | "pickModel"
  | "quickPrompts"
  | "writeCode"
  | "explainConcept"
  | "debugIssue"
  | "reviewCode"
  | "systemErrorPrefix"
  | "ready"
  | "simpleMode"
  | "advancedMode"
  | "switchToSimple"
  | "switchToAdvanced"
  | "headerActionHint"
  | "toolRunning"
  | "toolsRunning"
  | "conversations"
  | "workspace"
  | "defaultWorkspace"
  | "outputDir"
  | "outputDirPlaceholder"
  | "saveOutputDir"
  | "saved"
  | "addTemplate"
  | "templateTitle"
  | "templateTitlePlaceholder"
  | "templateDescription"
  | "templateDescriptionPlaceholder"
  | "templatePrompt"
  | "templatePromptPlaceholder"
  | "recommendedModels"
  | "otherModels"
  | "researchUnavailable"
  | "add"
  | "cancel"
  | "artifactLinks"
  | "artifactPaths"
  | "fallbackResponseBadge"
  | "assistantTyping"
  | "copilotPersona"
  | "copilotPersonaPlaceholder"
  | "personaPreset"
  | "personaPresetCustom"
  | "personaPresetImplementation"
  | "personaPresetReview"
  | "personaPresetResearch"
  | "localServerUrl";

const dict: Record<UiLanguage, Record<I18nKey, string>> = {
  ja: {
    appTitle: "GitHub Copilot Chat",
    newChat: "新しいチャット",
    newShort: "新規",
    expandSidebar: "サイドバーを展開",
    collapseSidebar: "サイドバーを折りたたむ",
    conversationSearch: "会話を検索",
    conversationSearchPlaceholder: "会話タイトルで検索",
    noConversations: "会話はまだありません",
    modelSelector: "モデル",
    agentMode: "エージェントモード",
    modeInteractive: "Interactive",
    modePlan: "Plan",
    modeAutopilot: "Autopilot",
    reasoningEffort: "推論強度",
    reasoningAuto: "自動",
    reasoningLow: "低",
    reasoningMedium: "中",
    reasoningHigh: "高",
    reasoningXHigh: "最高",
    toolsAvailable: "利用可能ツール",
    toolPolicy: "ツール制限",
    toolCategory: "カテゴリ",
    toolCategoryAll: "すべて",
    toolPolicyAll: "制限なし",
    toolPolicyAllow: "許可リスト",
    toolPolicyExclude: "除外リスト",
    applyToolPolicy: "適用",
    noToolsAvailable: "利用可能なツールが見つかりません",
    quotaRemaining: "残クォータ",
    quotaUsageRate: "使用率",
    modelRateMultiplier: "レート倍率",
    webSearchEnabled: "Web検索: 利用可",
    webSearchDisabled: "Web検索: 利用不可",
    compactContext: "コンテキスト圧縮",
    skills: "Prompt Templates（アプリ内）",
    profile: "プロフィール",
    profileDisplayName: "表示名",
    profileDisplayNamePlaceholder: "例: やまぱん",
    profileHeadline: "肩書き",
    profileHeadlinePlaceholder: "例: Azure Architect",
    editProfile: "編集",
    saveProfile: "保存",
    cancelProfile: "キャンセル",
    mcpQuickConnect: "MCP プロンプト支援",
    mcpUrlPlaceholder: "https://.../mcp (接続先URL)",
    mcpConnectByUrl: "テンプレート作成",
    skillSearch: "テンプレートを検索",
    skillSearchPlaceholder: "テンプレート名・説明で検索",
    language: "言語",
    theme: "テーマ",
    themeDark: "ダーク",
    themeLight: "ライト",
    langJa: "日本語",
    langEn: "English",
    poweredBy: "Powered by GitHub Copilot SDK",
    appVersion: "バージョン",
    signature: "署名",
    repository: "リポジトリ",
    rename: "名前変更",
    delete: "削除",
    renameTitle: "会話タイトル",
    saveRename: "保存",
    cancelRename: "キャンセル",
    emptyMessage: "メッセージを送って始めましょう",
    inputPlaceholder: "メッセージを入力…（Shift+Enterで改行）",
    inputHint: "Enterで送信 · Shift+Enterで改行 · ↑/↓で履歴",
    inputHintGenerating: "Enterで停止 · Shift+Enterで改行 · ↑/↓で履歴",
    sendMessage: "送信",
    stopGenerating: "生成停止",
    researchMode: "CLI Research (Fleet)",
    researchNextSend: "次の送信で CLI Research を実行",
    voiceInput: "音声入力",
    voiceUnsupported: "このブラウザは音声入力に未対応です",
    voicePermissionDenied:
      "マイク権限が拒否されました。ブラウザ設定を確認してください",
    voiceInputError: "音声入力でエラーが発生しました。再試行してください",
    voiceListening: "音声入力中…（マイクボタンでもう一度停止）",
    copyCode: "コードをコピー",
    copy: "コピー",
    copied: "コピー済み",
    welcomeSubtitle:
      "GitHub Copilot SDK を使った実用的な AI チャット。コード作成、調査、レビュー、改善をすばやく進められます。",
    pickModel: "利用モデルを選択",
    quickPrompts: "クイックプロンプト",
    writeCode: "コードを書く",
    explainConcept: "概念を説明",
    debugIssue: "不具合を調査",
    reviewCode: "コードレビュー",
    systemErrorPrefix: "⚠️ エラー",
    ready: "準備完了",
    simpleMode: "Simple",
    advancedMode: "Advanced",
    switchToSimple: "Simple UI に切替",
    switchToAdvanced: "Advanced UI に切替",
    headerActionHint:
      "操作: モード切替 / コンテキスト圧縮 / 新規チャット / Simple切替",
    toolRunning: "🔧 ツール実行中…",
    toolsRunning: "🔧 ツール実行中 ({count}件)…",
    conversations: "会話履歴",
    workspace: "ワークスペース",
    defaultWorkspace: "既定ワークスペース",
    outputDir: "成果物の出力先",
    outputDirPlaceholder: "例: ./reports",
    saveOutputDir: "出力先を保存",
    saved: "保存済み",
    addTemplate: "テンプレート追加",
    templateTitle: "テンプレート名",
    templateTitlePlaceholder: "例: 週次レポート",
    templateDescription: "説明",
    templateDescriptionPlaceholder: "例: レポート構成を自動作成",
    templatePrompt: "プロンプト",
    templatePromptPlaceholder: "実行したいテンプレート内容を入力",
    recommendedModels: "推奨モデル",
    otherModels: "その他",
    researchUnavailable: "このモデルでは Research は利用できません",
    add: "追加",
    cancel: "キャンセル",
    artifactLinks: "参照リンク",
    artifactPaths: "成果物パス",
    fallbackResponseBadge: "Web検索",
    assistantTyping: "アシスタントが入力中です",
    copilotPersona: "Copilot ペルソナ",
    copilotPersonaPlaceholder:
      "例: 端的・実務重視で、最初に結論→手順→注意点の順で回答",
    personaPreset: "ペルソナプリセット",
    personaPresetCustom: "カスタム",
    personaPresetImplementation: "実装用",
    personaPresetReview: "レビュー用",
    personaPresetResearch: "調査用",
    localServerUrl: "ローカルURL",
  },
  en: {
    appTitle: "GitHub Copilot Chat",
    newChat: "New Chat",
    newShort: "New",
    expandSidebar: "Expand sidebar",
    collapseSidebar: "Collapse sidebar",
    conversationSearch: "Search conversations",
    conversationSearchPlaceholder: "Search by conversation title",
    noConversations: "No conversations yet",
    modelSelector: "Model",
    agentMode: "Agent mode",
    modeInteractive: "Interactive",
    modePlan: "Plan",
    modeAutopilot: "Autopilot",
    reasoningEffort: "Reasoning effort",
    reasoningAuto: "Auto",
    reasoningLow: "Low",
    reasoningMedium: "Medium",
    reasoningHigh: "High",
    reasoningXHigh: "X-High",
    toolsAvailable: "Available tools",
    toolPolicy: "Tool policy",
    toolCategory: "Category",
    toolCategoryAll: "All",
    toolPolicyAll: "No restriction",
    toolPolicyAllow: "Allow list",
    toolPolicyExclude: "Exclude list",
    applyToolPolicy: "Apply",
    noToolsAvailable: "No tools available",
    quotaRemaining: "Quota remaining",
    quotaUsageRate: "Usage rate",
    modelRateMultiplier: "Rate multiplier",
    webSearchEnabled: "Web search: available",
    webSearchDisabled: "Web search: unavailable",
    compactContext: "Compact context",
    skills: "Prompt Templates (App)",
    profile: "Profile",
    profileDisplayName: "Display name",
    profileDisplayNamePlaceholder: "e.g. Yamapan",
    profileHeadline: "Headline",
    profileHeadlinePlaceholder: "e.g. Azure Architect",
    editProfile: "Edit",
    saveProfile: "Save",
    cancelProfile: "Cancel",
    mcpQuickConnect: "MCP Prompt Assist",
    mcpUrlPlaceholder: "https://.../mcp (endpoint URL)",
    mcpConnectByUrl: "Generate template",
    skillSearch: "Search templates",
    skillSearchPlaceholder: "Search by name or description",
    language: "Language",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    langJa: "日本語",
    langEn: "English",
    poweredBy: "Powered by GitHub Copilot SDK",
    appVersion: "Version",
    signature: "Signature",
    repository: "Repository",
    rename: "Rename",
    delete: "Delete",
    renameTitle: "Conversation title",
    saveRename: "Save",
    cancelRename: "Cancel",
    emptyMessage: "Send a message to get started",
    inputPlaceholder: "Send a message… (Shift+Enter for new line)",
    inputHint: "Enter to send · Shift+Enter for new line · ↑/↓ history",
    inputHintGenerating:
      "Enter to stop · Shift+Enter for new line · ↑/↓ history",
    sendMessage: "Send message",
    stopGenerating: "Stop generating",
    researchMode: "CLI Research (Fleet)",
    researchNextSend: "Applies to next send only (CLI/Fleet)",
    voiceInput: "Voice input",
    voiceUnsupported: "Voice input is not supported in this browser",
    voicePermissionDenied:
      "Microphone permission was denied. Please check your browser settings",
    voiceInputError: "Voice input failed. Please try again",
    voiceListening: "Listening… (click mic again to stop)",
    copyCode: "Copy code",
    copy: "Copy",
    copied: "Copied",
    welcomeSubtitle:
      "A practical AI chat built with GitHub Copilot SDK for coding, research, reviews, and daily development work.",
    pickModel: "Pick a model",
    quickPrompts: "Quick prompts",
    writeCode: "Write code",
    explainConcept: "Explain concept",
    debugIssue: "Debug issue",
    reviewCode: "Review code",
    systemErrorPrefix: "⚠️ Error",
    ready: "Ready",
    simpleMode: "Simple",
    advancedMode: "Advanced",
    switchToSimple: "Switch to Simple UI",
    switchToAdvanced: "Switch to Advanced UI",
    headerActionHint:
      "Actions: mode switch / compact context / new chat / switch to Simple",
    toolRunning: "🔧 Running tool…",
    toolsRunning: "🔧 Running tools ({count})…",
    conversations: "Conversations",
    workspace: "Workspace",
    defaultWorkspace: "Default workspace",
    outputDir: "Output directory",
    outputDirPlaceholder: "e.g. ./reports",
    saveOutputDir: "Save output directory",
    saved: "Saved",
    addTemplate: "Add template",
    templateTitle: "Template title",
    templateTitlePlaceholder: "e.g. Weekly report",
    templateDescription: "Description",
    templateDescriptionPlaceholder: "e.g. Generate report structure",
    templatePrompt: "Prompt",
    templatePromptPlaceholder: "Enter template prompt",
    recommendedModels: "Recommended",
    otherModels: "Others",
    researchUnavailable: "Research is unavailable for this model",
    add: "Add",
    cancel: "Cancel",
    artifactLinks: "References",
    artifactPaths: "Artifact paths",
    fallbackResponseBadge: "Web search",
    assistantTyping: "Assistant is typing",
    copilotPersona: "Copilot persona",
    copilotPersonaPlaceholder:
      "e.g. Be concise and practical. Respond in order: conclusion, steps, caveats.",
    personaPreset: "Persona preset",
    personaPresetCustom: "Custom",
    personaPresetImplementation: "Implementation",
    personaPresetReview: "Review",
    personaPresetResearch: "Research",
    localServerUrl: "Local URL",
  },
};

export function t(language: UiLanguage, key: I18nKey): string {
  return dict[language][key] ?? key;
}

export function languageToSpeechCode(language: UiLanguage): string {
  return language === "ja" ? "ja-JP" : "en-US";
}
