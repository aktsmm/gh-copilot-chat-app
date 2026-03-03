# GitHub Copilot Chat GUI — 詳細仕様書

> **Version**: 1.0.0 | **Last updated**: 2026-03-04

## 目次

- [1. アーキテクチャ概要](#1-アーキテクチャ概要)
- [2. サーバー仕様](#2-サーバー仕様)
  - [2.1 REST API](#21-rest-api)
  - [2.2 Socket.IO イベント](#22-socketio-イベント)
  - [2.3 環境変数](#23-環境変数)
  - [2.4 Copilot クライアント管理](#24-copilot-クライアント管理)
  - [2.5 セッション管理](#25-セッション管理)
  - [2.6 Web 検索フォールバック](#26-web-検索フォールバック)
  - [2.7 エラーコード体系](#27-エラーコード体系)
- [3. クライアント仕様](#3-クライアント仕様)
  - [3.1 状態管理](#31-状態管理)
  - [3.2 型定義](#32-型定義)
  - [3.3 チャットフック](#33-チャットフック)
  - [3.4 Socket 接続](#34-socket-接続)
  - [3.5 国際化（i18n）](#35-国際化i18n)
  - [3.6 スキルシステム](#36-スキルシステム)
  - [3.7 UI モード](#37-ui-モード)
- [4. デスクトップ (Electron) 仕様](#4-デスクトップ-electron-仕様)
  - [4.1 メインプロセス](#41-メインプロセス)
  - [4.2 組み込みサーバー](#42-組み込みサーバー)
- [5. 共有モジュール](#5-共有モジュール)
- [6. ビルドシステム](#6-ビルドシステム)
- [7. セキュリティモデル](#7-セキュリティモデル)
- [8. CI/CD ワークフロー](#8-cicd-ワークフロー)
  - [8.1 cli-release-auto-pr（自動リリース追従）](#81-cli-release-auto-pr自動リリース追従)
  - [8.2 smoke-vite-server-url（PR 検証）](#82-smoke-vite-server-urlpr-検証)
  - [8.3 release-desktop-assets（デスクトップリリース）](#83-release-desktop-assetsデスクトップリリース)

---

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                    Electron Shell                    │
│  ┌──────────────┐           ┌─────────────────────┐ │
│  │  BrowserWindow│◄──HTTP──►│  Embedded Server    │ │
│  │  (client)     │   WS     │  (Express+Socket.IO)│ │
│  └──────────────┘           └──────┬──────────────┘ │
│                                    │                 │
└────────────────────────────────────┼─────────────────┘
                                     │ child process
                              ┌──────▼──────┐
                              │ Copilot CLI  │
                              │ (@github/    │
                              │  copilot)    │
                              └──────┬──────┘
                                     │ HTTPS
                              ┌──────▼──────┐
                              │   GitHub     │
                              │  Copilot API │
                              └─────────────┘
```

### パッケージ構成

| パッケージ  | パス       | 役割                                      | 主要技術                            |
| ----------- | ---------- | ----------------------------------------- | ----------------------------------- |
| **client**  | `client/`  | Web フロントエンド                        | React 19 + Vite 6 + Tailwind CSS    |
| **server**  | `server/`  | バックエンド API + Copilot セッション管理 | Express 5 + Socket.IO + Copilot SDK |
| **desktop** | `desktop/` | Electron デスクトップラッパー             | Electron 35 + 組み込みサーバー      |
| **shared**  | `shared/`  | 共有型定義・定数                          | TypeScript + JavaScript             |

### 通信フロー

```
ユーザー入力 → React UI → Socket.IO (chat:send)
    → Express Server → CopilotClient → Copilot CLI (child process)
    → GitHub Copilot API → ストリーミング応答
    → chat:delta / chat:message → React UI に反映
```

### ポート規約

| ポート | 用途                                   |
| ------ | -------------------------------------- |
| `3001` | 開発モード（`npm run dev`）            |
| `5173` | Vite 開発サーバー（client HMR）        |
| `3002` | デスクトップ Electron 組み込みサーバー |

---

## 2. サーバー仕様

### 2.1 REST API

全エンドポイントは `config.security.requireAccessToken === true` の場合、`Authorization: Bearer <token>` または `X-Access-Token` ヘッダーによる認証が必要。

| Method   | Path                | 説明                                          | レスポンス例                             |
| -------- | ------------------- | --------------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/health`       | ヘルスチェック                                | `{ status: "ok", timestamp: "..." }`     |
| `GET`    | `/api/sessions`     | 全セッション一覧（session オブジェクト除外）  | `[{ id, model, title, createdAt, ... }]` |
| `DELETE` | `/api/sessions/:id` | セッション削除（SDK destroy + deleteSession） | `{ ok: true }`                           |
| `PATCH`  | `/api/sessions/:id` | セッション名変更                              | `{ ok: true }`                           |
| `GET`    | `/api/models`       | 利用可能モデル一覧                            | `[{ id, name, ... }]`                    |
| `GET`    | `/api/auth`         | 認証状態確認                                  | `{ authenticated: true, ... }`           |
| `GET`    | `/api/status`       | クライアント状態とセッション数                | `{ state: "connected", sessions: 3 }`    |
| `GET`    | `/api/workspace`    | ワークスペースパス情報                        | `{ cwd: "...", reports: "..." }`         |

### 2.2 Socket.IO イベント

#### Client → Server（リクエスト）

| イベント              | ペイロード                                                                                            | 説明                        |
| --------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| `chat:create`         | `{ model?, mode?, reasoningEffort?, availableTools?, excludedTools?, systemMessage?, title? }`        | 新規セッション作成          |
| `chat:send`           | `{ sessionId, prompt, mode?, startFleet?, preferredLocation?, preferredLocale?, locale?, timeZone? }` | メッセージ送信              |
| `chat:abort`          | `{ sessionId }`                                                                                       | 生成中断                    |
| `sessions:list`       | `{}`                                                                                                  | セッション一覧取得          |
| `session:delete`      | `{ sessionId }`                                                                                       | セッション削除              |
| `session:rename`      | `{ sessionId, title }`                                                                                | セッション名変更            |
| `session:mode`        | `{ sessionId, mode? }`                                                                                | エージェントモード取得/変更 |
| `session:model`       | `{ sessionId, model }`                                                                                | モデル変更                  |
| `session:tools`       | `{ sessionId, availableTools?, excludedTools? }`                                                      | ツールポリシー変更          |
| `session:compact`     | `{ sessionId }`                                                                                       | コンテキスト圧縮            |
| `session:fleet_start` | `{ sessionId, prompt? }`                                                                              | Fleet/Research モード開始   |
| `models:list`         | `{}`                                                                                                  | モデル一覧取得              |
| `tools:list`          | `{ model? }`                                                                                          | ツール一覧取得              |
| `account:quota`       | `{}`                                                                                                  | クォータ情報取得            |

#### Server → Client（プッシュ）

| イベント              | ペイロード                                                                                        | 説明                       |
| --------------------- | ------------------------------------------------------------------------------------------------- | -------------------------- |
| `chat:delta`          | `{ sessionId, content }`                                                                          | ストリーミングトークン差分 |
| `chat:message`        | `{ sessionId, content, role, messageId, source?, sourceModel? }`                                  | 完成メッセージ             |
| `chat:tool_start`     | `{ sessionId, toolName, toolCallId }`                                                             | ツール実行開始             |
| `chat:tool_done`      | `{ sessionId, toolName, toolCallId, output, success }`                                            | ツール実行完了             |
| `chat:idle`           | `{ sessionId }`                                                                                   | 生成完了（アイドル状態）   |
| `chat:error`          | `{ sessionId, error, errorCode }`                                                                 | エラー通知                 |
| `chat:created`        | `{ sessionId, model, mode, reasoningEffort?, availableTools?, excludedTools?, title, createdAt }` | セッション作成完了         |
| `chat:title`          | `{ sessionId, title }`                                                                            | SDK 自動タイトル変更       |
| `chat:mode`           | `{ sessionId, mode }`                                                                             | モード変更通知             |
| `chat:model`          | `{ sessionId, model }`                                                                            | モデル変更通知             |
| `chat:tools_updated`  | `{ sessionId, availableTools?, excludedTools? }`                                                  | ツールポリシー変更通知     |
| `chat:compacted`      | `{ sessionId, success, tokensRemoved, messagesRemoved }`                                          | コンテキスト圧縮結果       |
| `chat:fleet_started`  | `{ sessionId, mode }`                                                                             | Fleet Research 開始通知    |
| `chat:subagent_start` | `{ sessionId, agentName }`                                                                        | サブエージェント開始       |
| `chat:subagent_done`  | `{ sessionId, agentName }`                                                                        | サブエージェント完了       |

### 2.3 環境変数

#### サーバー基本設定

| 変数名         | デフォルト            | 説明                                        |
| -------------- | --------------------- | ------------------------------------------- |
| `PORT`         | `3001`                | サーバーポート（1–65535）                   |
| `HOST`         | `127.0.0.1`           | バインドホスト                              |
| `CORS_ORIGINS` | localhost 系6オリジン | CORS 許可オリジン（カンマ区切り、`*` 禁止） |
| `NODE_ENV`     | —                     | `"production"` で一部挙動変更               |

#### セキュリティ

| 変数名                                 | デフォルト                  | 説明                     |
| -------------------------------------- | --------------------------- | ------------------------ |
| `SERVER_ACCESS_TOKEN` / `ACCESS_TOKEN` | —                           | API アクセストークン     |
| `REQUIRE_ACCESS_TOKEN`                 | ループバック以外は `true`   | トークン認証必須フラグ   |
| `STRICT_TOOL_PERMISSIONS`              | `requireAccessToken` と同じ | ツール実行権限の厳密制御 |
| `PERMISSION_ALLOW_KINDS`               | `"read,url,mcp"`            | 許可する権限種類         |

許可可能な権限種類: `shell`, `write`, `mcp`, `read`, `url`, `custom-tool`

#### GitHub / BYOK 認証

| 変数名                                               | デフォルト | 説明                                                |
| ---------------------------------------------------- | ---------- | --------------------------------------------------- |
| `GITHUB_TOKEN` / `GH_TOKEN` / `COPILOT_GITHUB_TOKEN` | —          | GitHub 認証トークン                                 |
| `BYOK_PROVIDER`                                      | —          | BYOK プロバイダ（`openai` / `azure` / `anthropic`） |
| `BYOK_API_KEY`                                       | —          | BYOK API キー                                       |
| `BYOK_BASE_URL`                                      | —          | BYOK ベース URL                                     |
| `BYOK_MODEL`                                         | —          | BYOK モデル                                         |

#### Copilot CLI

| 変数名              | デフォルト | 説明                         |
| ------------------- | ---------- | ---------------------------- |
| `COPILOT_CLI_PATH`  | 自動検出   | Copilot CLI 実行ファイルパス |
| `COPILOT_LOG_LEVEL` | `"info"`   | SDK ログレベル               |

#### Web 検索フォールバック

| 変数名                                 | デフォルト                | 説明                      |
| -------------------------------------- | ------------------------- | ------------------------- |
| `ENABLE_WEB_SEARCH_FALLBACK`           | 非 production 時 `true`   | フォールバック有効化      |
| `WEB_SEARCH_FALLBACK_MODEL`            | `"gpt-5-mini"`            | フォールバック用モデル    |
| `WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS`   | `false`                   | 全 URL 許可（本番非推奨） |
| `WEB_SEARCH_FALLBACK_ALLOWED_URLS`     | 天気・ニュース系 8 サイト | 許可ホスト一覧            |
| `WEB_SEARCH_FALLBACK_TIMEOUT_MS`       | `90000`                   | タイムアウト（ms）        |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCATION` | —                         | デフォルト天気地域        |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCALE`   | —                         | デフォルトロケール        |
| `WEB_SEARCH_FALLBACK_DEFAULT_TIMEZONE` | —                         | デフォルトタイムゾーン    |

#### 可観測性

| 変数名                              | デフォルト | 説明                   |
| ----------------------------------- | ---------- | ---------------------- |
| `CHAT_ERROR_UNKNOWN_WARN_THRESHOLD` | `10`       | UNKNOWN エラー警告閾値 |

### 2.4 Copilot クライアント管理

**シングルトンパターン**で `CopilotClient` インスタンスを1つだけ保持。

```
getClient()
  ├── 接続済み → そのまま返却
  ├── stale（非 connected）→ stop() → 再作成
  └── 未作成 → 新規作成
```

**CopilotClient オプション:**

- `autoStart: true` — 自動起動
- `autoRestart: true` — 自動再起動
- `cliPath` — CLI 実行ファイルパス（自動検出または環境変数）
- `logLevel` — SDK ログレベル
- `githubToken` — GitHub 認証トークン（オプション）

**BYOK 対応:**
`buildProviderConfig()` で `{ type, baseUrl, apiKey }` を構築し、Copilot SDK の provider オプションに渡す。

### 2.5 セッション管理

`Map<string, SessionEntry>` によるメモリ内管理。

#### SessionEntry 構造

```typescript
{
  id: string;              // UUID v4
  session: CopilotSession; // SDK セッションオブジェクト
  model: string;           // 使用モデル ID
  createdAt: Date;
  lastUsed: Date;
  title: string;
  mode: AgentMode;         // "interactive" | "plan" | "autopilot"
  reasoningEffort?: SessionReasoningEffort; // "low"|"medium"|"high"|"xhigh"
  availableTools?: string[];
  excludedTools?: string[];
}
```

#### ライフサイクル

1. **作成** — `createSession()`: UUID 生成 → `SessionConfig` 構築 → `client.createSession()` → mode 設定（`session.rpc.mode.set`）
2. **復元** — `resumeSession()`: 既存なら即返却、なければ `client.resumeSession()` で復元
3. **再設定** — `reconfigureSessionTools()`: `client.resumeSession()` で新インスタンス取得 → モデル / ツール設定更新
4. **削除** — `deleteSession()`: `session.destroy()` → `client.deleteSession()` → Map 削除

#### セッション設定

```typescript
SessionConfig = {
  model: string;
  streaming: true;
  sessionId: string;         // UUID
  permissionHandler: Function;
  clientName: "copilot-chat-gui";
  systemMessage?: string;
  reasoningEffort?: string;
  availableTools?: string[];
  excludedTools?: string[];
  provider?: ProviderConfig; // BYOK 時のみ
}
```

#### Permission Handler

- `strictToolPermissions = false` → 全許可（`approveAll`）
- `strictToolPermissions = true` → `allowedPermissionKinds` に含まれる kind のみ承認

### 2.6 Web 検索フォールバック

セッションのモデル・ツール構成で Web 検索ツールが利用できない場合に、Copilot CLI を直接起動して検索結果を取得する仕組み。

#### 処理フロー

```
chat:send 受信
  → isLikelyWebSearchPrompt() でプロンプト判定
  → isWebSearchToolAvailable() でツール有無チェック
  → ツール無し && 検索系プロンプト → フォールバック実行
    → buildWebSearchPrompt() でプロンプト構築
    → copilot CLI を execFile() で直接起動
    → 結果を carryover としてセッションに保存
    → 次回メッセージ送信時に追加コンテキストとして付与
```

#### プロンプト判定キーワード

天気 / 最新 / ニュース / 検索 / 今日 / 株価 / weather / news / search / latest / current 等

#### 認識する Web 検索ツール名

`web_search`, `brave_web_search`, `bing_web_search`, `bing_search`, `mcp_brave-search_brave_web_search`, `mcp_brave-search_brave_news_search`, `mcp_brave-search_brave_local_search`

#### デフォルト許可 URL

`weather.gov`, `www.jma.go.jp`, `tenki.jp`, `www.bbc.com`, `www.reuters.com`, `apnews.com`, `www.nhk.or.jp`, `www.nikkei.com`

#### 地域推定ロジック

`inferDefaultWeatherLocation()`: `preferredLocation` → `locale` → `timezone` の優先順で推定。

### 2.7 エラーコード体系

#### ChatErrorCode 一覧

| コード                  | 発生条件                                                 |
| ----------------------- | -------------------------------------------------------- |
| `INVALID_REQUEST`       | sessionId / prompt / model / mode の不正                 |
| `SESSION_NOT_FOUND`     | 指定セッションが存在しない                               |
| `MODE_SWITCH_FAILED`    | エージェントモード切替失敗                               |
| `FLEET_UNAVAILABLE`     | Research モード非対応                                    |
| `FLEET_START_FAILED`    | Fleet 起動失敗                                           |
| `SEND_FAILED`           | メッセージ送信失敗                                       |
| `CREATE_SESSION_FAILED` | セッション作成失敗                                       |
| `MODEL_LIST_FAILED`     | モデル一覧取得失敗                                       |
| `TOOLS_LIST_FAILED`     | ツール一覧取得失敗                                       |
| `SESSION_ERROR`         | セッション汎用エラー                                     |
| `CLI_NOT_FOUND`         | Copilot CLI が見つからない                               |
| `CLI_SPAWN_FAILED`      | CLI プロセス起動失敗（EINVAL / ENOENT / EACCES / EPERM） |
| `CLI_NOT_CONNECTED`     | CLI 未接続                                               |
| `AUTH_REQUIRED`         | 認証が必要                                               |
| `UNKNOWN`               | 分類不能（閾値超過で警告出力）                           |

#### エラー処理フロー

```
エラー発生
  → classifyChatErrorCode()  // メッセージ正規化テキストから自動分類
  → recordChatErrorMetric()  // Map<ChatErrorCode, number> でカウント
  → emitChatError()          // chat:error イベント送信
```

UNKNOWN エラーがカウント閾値（デフォルト10）を超えると `console.error` で警告出力。

---

## 3. クライアント仕様

### 3.1 状態管理

**Zustand 不使用** — `useSyncExternalStore` による React 19 ネイティブな外部ストア。

#### ChatState 構造

```typescript
interface ChatState {
  // --- 会話データ ---
  conversations: Map<string, Conversation>;
  activeId: string | null;
  sessionUi: Map<
    string,
    {
      isGenerating: boolean;
      streamBuffer: string;
      activeTools: ToolCall[];
    }
  >;

  // --- カタログ ---
  modelCatalog: ModelInfoLite[];
  availableToolsCatalog: ToolInfoLite[];
  quotaSnapshots: Record<string, QuotaSnapshot>;
  availableModels: string[];

  // --- ユーザー設定（localStorage 永続化） ---
  preferredModel: string;
  preferredAgentMode: AgentMode;
  preferredReasoningEffort: PreferredReasoningEffort;
  uiLanguage: UiLanguage;
  themeMode: ThemeMode;
  uiMode: UiMode;
  userProfile: UserProfile;
  copilotPersona: string;
}
```

#### 永続化

`localStorage` キー `ghc-chat-settings-v1` に以下を保存:
`preferredModel`, `preferredAgentMode`, `preferredReasoningEffort`, `uiLanguage`, `themeMode`, `uiMode`, `userProfile`, `copilotPersona`

#### モデル表示フィルタリング

- `gpt-5.1` → `gpt-5` に正規化
- `o3`, `o3-*`, `-mini-` を含む名前は非表示
- 同系統モデルの古いバージョンをフィルタ（GPT-5.x, Claude-\*-4.x）

### 3.2 型定義

```typescript
// --- 基本型 ---
type UiLanguage = "ja" | "en";
type ThemeMode = "dark" | "light";
type UiMode = "simple" | "advanced";
type AgentMode = "interactive" | "plan" | "autopilot";
type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
type PreferredReasoningEffort = ReasoningEffort | "auto";
type ChatMessageSource = "default" | "web-search-fallback";

// --- データモデル ---
interface UserProfile {
  displayName: string;
  headline?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  source?: ChatMessageSource;
  sourceModel?: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id?: string;
  name: string;
  status: "running" | "done";
  output?: string;
}

interface Conversation {
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

// --- カタログ ---
interface ModelInfoLite {
  id: string;
  name: string;
  reasoningSupported: boolean;
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
  rateMultiplier?: number;
}

interface ToolInfoLite {
  name: string;
  namespacedName?: string;
  description: string;
  category: string;
}

interface QuotaSnapshot {
  entitlementRequests: number;
  usedRequests: number;
  remainingPercentage: number;
  overage: boolean;
  overageAllowedWithExhaustedQuota: boolean;
  resetDate?: string;
}

// --- スキル ---
interface SkillTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  recommendedModel?: string;
}
```

### 3.3 チャットフック

`useChat()` — アプリケーション全体のチャットロジックを管理するカスタムフック。

#### 初期化フロー

```
Socket 接続
  → requestCapabilities()
    → sessions:list  → 既存会話の復元
    → models:list    → モデルカタログ更新
    → tools:list     → ツールカタログ更新
    → account:quota  → クォータ情報取得
```

#### リアルタイムイベントリスナー（12 イベント）

`chat:delta`, `chat:message`, `chat:idle`, `chat:tool_start`, `chat:tool_done`, `chat:error`, `chat:title`, `chat:mode`, `chat:model`, `chat:tools_updated`, `chat:compacted`, `chat:fleet_started`

#### 公開アクション

| アクション                    | 説明                       |
| ----------------------------- | -------------------------- |
| `createChat`                  | 新規チャット作成           |
| `sendMessage`                 | メッセージ送信             |
| `abortGeneration`             | 生成中断                   |
| `deleteChat`                  | チャット削除               |
| `renameChat`                  | チャット名変更             |
| `switchChat`                  | アクティブチャット切替     |
| `setConversationMode`         | エージェントモード変更     |
| `setConversationModel`        | モデル変更                 |
| `setConversationToolPolicy`   | ツールポリシー変更         |
| `compactActiveSession`        | コンテキスト圧縮           |
| `runSkill`                    | スキルテンプレート実行     |
| `quickConnectMcpByUrl`        | MCP サーバーにクイック接続 |
| `setPreferredModel`           | デフォルトモデル変更       |
| `setPreferredAgentMode`       | デフォルトモード変更       |
| `setPreferredReasoningEffort` | デフォルト推論強度変更     |
| `setUiLanguage`               | 表示言語変更               |
| `setThemeMode`                | テーマ変更                 |
| `setUiMode`                   | UI モード変更              |
| `setUserProfile`              | プロフィール変更           |
| `setCopilotPersona`           | ペルソナ設定               |

#### Deep Research

`buildResearchPrompt()` で構造化プロンプトを生成:
目的整理 → 調査計画 → 比較分析 → 推奨事項 → リスク評価

#### ロケールコンテキスト

`navigator.language` + `Intl.DateTimeFormat().resolvedOptions().timeZone` を自動取得してサーバーに送信。天気・ニュース系のプロンプトで地域推定に使用。

### 3.4 Socket 接続

```typescript
// シングルトン接続
const socket = io(serverUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: Infinity,
  auth: { token: accessToken }, // VITE_SERVER_ACCESS_TOKEN
});
```

**接続先の決定:**

- `VITE_SERVER_URL` 環境変数が設定されていればそれを使用
- 未設定なら `window.location.origin`（Electron 組み込み時はこちら）

### 3.5 国際化（i18n）

- **対応言語**: 日本語 (`ja`) / 英語 (`en`)
- **キー数**: 約 120 キー
- **カテゴリ**: アプリ基本、サイドバー、モデル/エージェント、ツール、プロフィール、MCP、テーマ、会話操作、チャット入力、音声入力、ウェルカム画面、テンプレート、ペルソナ
- **関数**: `t(language, key)` — 辞書引き
- **音声入力**: `languageToSpeechCode("ja")` → `"ja-JP"`, `languageToSpeechCode("en")` → `"en-US"`

### 3.6 スキルシステム

ビルトインの 6 テンプレート:

| ID                | タイトル                  | 推奨モデル        | 用途                     |
| ----------------- | ------------------------- | ----------------- | ------------------------ |
| `deep-research`   | Deep Research (CLI/Fleet) | `gpt-5`           | 構造化リサーチ           |
| `security-review` | Security Review           | `gpt-5.3-codex`   | セキュリティレビュー     |
| `test-design`     | Test Design               | `gpt-4.1`         | テスト設計               |
| `refactor-plan`   | Refactor Plan             | `claude-sonnet-4` | リファクタリング計画     |
| `mcp-web-setup`   | MCP Setup (Web)           | `gpt-5`           | MCP Web サーバー接続     |
| `mcp-local-setup` | MCP Setup (Local)         | `gpt-5`           | MCP ローカルサーバー接続 |

各スキルは日英両対応のプロンプトを持ち、`getSkills(language)` で `SkillTemplate[]` に変換。

### 3.7 UI モード

| モード                   | 説明                                                         |
| ------------------------ | ------------------------------------------------------------ |
| **Simple** (`SimpleApp`) | 最小限の UI。遅延ロード。チャット入力と応答表示のみ          |
| **Advanced**             | フル機能。サイドバー、設定、スキル、ツール管理、クォータ表示 |

**Research 対応モデル判定**: `gpt-5*`, `claude-sonnet*`, `claude-opus*` を含むモデルで Fleet Research が利用可能。

---

## 4. デスクトップ (Electron) 仕様

### 4.1 メインプロセス

#### ウィンドウ設定

| 項目             | 値                           |
| ---------------- | ---------------------------- |
| サイズ           | 1200 × 800（最小 600 × 400） |
| 背景色           | `#0d1117`                    |
| contextIsolation | `true`                       |
| nodeIntegration  | `false`                      |

#### セキュリティ

- **外部リンク**: `http:` / `https:` のみ `shell.openExternal()` で開く
- **In-app navigation**: `http://127.0.0.1:{port}` のみ許可
- **multple instance**: `app.requestSingleInstanceLock()` で多重起動防止

#### メニュー

| メニュー        | アクション                                          |
| --------------- | --------------------------------------------------- |
| File → New Chat | `Ctrl+N` — メインウィンドウにフォーカス             |
| File → Quit     | `Ctrl+Q` — アプリ終了                               |
| Edit            | undo / redo / cut / copy / paste / selectAll        |
| View            | reload / zoom / fullscreen / devTools（開発時のみ） |
| Help → About    | バージョン情報ダイアログ                            |
| Help → GitHub   | リポジトリを外部ブラウザで開く                      |

#### システムトレイ

- **メニュー**: Show / Quit
- **ダブルクリック**: ウィンドウ表示
- **閉じるボタン**: quit フラグがなければトレイに最小化

#### グローバルショートカット

`Ctrl+Shift+C` — ウィンドウの表示/非表示トグル

#### ライフサイクル

```
app.ready
  → startEmbeddedServer()
  → createWindow()
  → createMenu()
  → createTray()

app.before-quit
  → stopEmbeddedServer()
```

### 4.2 組み込みサーバー

server/ の Express + Socket.IO コードをそのまま import して Electron プロセス内で起動。

| 項目                 | 値                                                              |
| -------------------- | --------------------------------------------------------------- |
| ポート               | `3002`（使用中なら `0` = ランダム）                             |
| ホスト               | `127.0.0.1` 固定                                                |
| クライアントアセット | packaged: `process.resourcesPath/client`、dev: `../client/dist` |

**CORS + Auth**: server/src/config の `isCorsOriginAllowed` と `hasValidAccessToken` を再利用。追加で `hasTrustedOrigin()` チェック。

**停止処理**: `stopClient()` → `httpServer.close()`

---

## 5. 共有モジュール

### chat-error-code

`shared/chat-error-code.js` で定義し、`shared/chat-error-code.d.ts` は `scripts/sync-chat-error-code-dts.mjs` で自動生成。

```typescript
const CHAT_ERROR_CODES = [
  "INVALID_REQUEST",
  "SESSION_NOT_FOUND",
  "MODE_SWITCH_FAILED",
  "FLEET_UNAVAILABLE",
  "FLEET_START_FAILED",
  "SEND_FAILED",
  "CREATE_SESSION_FAILED",
  "MODEL_LIST_FAILED",
  "TOOLS_LIST_FAILED",
  "SESSION_ERROR",
  "CLI_NOT_FOUND",
  "CLI_SPAWN_FAILED",
  "CLI_NOT_CONNECTED",
  "AUTH_REQUIRED",
  "UNKNOWN",
] as const;

type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];
function isChatErrorCode(value: unknown): value is ChatErrorCode;
```

サーバー・クライアント両方から参照される SSOT（Single Source of Truth）。

---

## 6. ビルドシステム

### npm scripts（ルート）

| コマンド                | 説明                                                   |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | server + client 同時起動（concurrently）               |
| `npm run dev:server`    | server のみ起動（tsx watch）                           |
| `npm run dev:client`    | client のみ起動（Vite dev server）                     |
| `npm run dev:desktop`   | client ビルド → Electron 起動                          |
| `npm run build`         | client + server プロダクションビルド                   |
| `npm run build:desktop` | client + server ビルド → Electron パッケージング       |
| `npm run start`         | server 本番起動                                        |
| `npm run clean`         | dist / cache 一括削除（rimraf）                        |
| `npm run lint`          | ESLint 実行                                            |
| `npm run typecheck`     | sync:chat-error-code-dts → tsc --noEmit × 3 パッケージ |
| `npm run preflight`     | 起動前チェック（CLI 存在確認等）                       |

### 依存関係

#### server

| 種類    | パッケージ                                                                         |
| ------- | ---------------------------------------------------------------------------------- |
| Runtime | `@github/copilot-sdk`, `cors`, `dotenv`, `express` 5, `socket.io`, `uuid`, `zod`   |
| Dev     | `@types/cors`, `@types/express`, `@types/node`, `@types/uuid`, `tsx`, `typescript` |

#### client

| 種類    | パッケージ                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime | `lucide-react`, `react` 19, `react-dom` 19, `react-markdown`, `react-syntax-highlighter`, `remark-gfm`, `socket.io-client` |
| Dev     | `@tailwindcss/typography`, `@types/react*`, `@vitejs/plugin-react`, `autoprefixer`, `postcss`, `tailwindcss`, `vite` 6     |

#### desktop

| 種類    | パッケージ                                                                                  |
| ------- | ------------------------------------------------------------------------------------------- |
| Runtime | `@github/copilot-sdk`, `cors`, `dotenv`, `electron-store`, `express` 5, `socket.io`, `uuid` |
| Dev     | `electron` 35, `electron-builder`, `rcedit`, `typescript`                                   |

### Electron Builder 設定

| 項目            | 値                           |
| --------------- | ---------------------------- |
| appId           | `com.copilot-chat.desktop`   |
| Windows         | NSIS + Portable              |
| macOS           | DMG                          |
| Linux           | AppImage + deb               |
| Extra Resources | `server/dist`, `client/dist` |

---

## 7. セキュリティモデル

### アクセス制御

```
リクエスト受信
  ├── ループバックアドレス → 認証不要（デフォルト）
  └── 外部アクセス
       ├── requireAccessToken = true → Bearer トークン検証
       └── requireAccessToken = false → 通過（非推奨）
```

### CORS

- `*` は明示的に禁止
- デフォルトで localhost 系 6 オリジンのみ許可
- `CORS_ORIGINS` 環境変数でカンマ区切り指定可

### ツール権限

```
ツール実行リクエスト
  ├── strictToolPermissions = false → 全許可
  └── strictToolPermissions = true
       ├── kind が allowedPermissionKinds に含まれる → 許可
       └── 含まれない → 拒否
```

デフォルト許可: `read`, `url`, `mcp`
明示的に許可が必要: `shell`, `write`, `custom-tool`

### Electron セキュリティ

- `contextIsolation: true` — レンダラーとメインプロセスのコンテキスト分離
- `nodeIntegration: false` — レンダラーから Node.js API へのアクセス禁止
- Navigation は `127.0.0.1:{port}` のみに制限
- 外部リンクは `shell.openExternal()` で OS デフォルトブラウザに委譲

## 8. CI/CD ワークフロー

本プロジェクトでは 3 つの GitHub Actions ワークフローで CI/CD を自動化しています。

### 8.1 cli-release-auto-pr（自動リリース追従）

**ファイル**: `.github/workflows/cli-release-auto-pr.yml`

```
cron (8 時間毎) or 手動 workflow_dispatch
  │
  ├── github/copilot-cli の最新リリースを GitHub API で取得
  ├── .github/automation/cli-release-state.json と比較
  │     └── 新リリースなし → 終了
  │
  ├── 新リリースあり
  │     ├── リリースノートからモデル ID を正規表現で抽出 (gpt-*, claude-*, o*)
  │     ├── client/src/lib/store.ts の DEFAULT_MODELS を更新
  │     ├── client/src/lib/useChat.ts の FALLBACK_MODELS を更新
  │     ├── reports/ にレポート生成
  │     └── cli-release-state.json 更新
  │
  ├── lint + typecheck 検証
  │
  ├── peter-evans/create-pull-request で Draft PR 作成
  │
  └── @copilot にレビュー依頼コメントを自動投稿
        └── GitHub Copilot Coding Agent がコード差分を確認
```

**入力パラメータ**:

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `releaseRepo` | `github/copilot-cli` | 監視対象リポジトリ |
| `force` | `false` | `true` で前回タグに関係なく強制実行 |

### 8.2 smoke-vite-server-url（PR 検証）

**ファイル**: `.github/workflows/smoke-vite-server-url.yml`

```
Pull Request 作成 / 更新
  │
  ├── npm ci
  ├── npm run lint
  ├── npm run typecheck
  ├── npm test
  └── Vite dev サーバー起動 → HTTP ヘルスチェック → 終了
```

すべてのステップが成功しないとマージ不可（branch protection で保護推奨）。

### 8.3 release-desktop-assets（デスクトップリリース）

**ファイル**: `.github/workflows/release-desktop-assets.yml`

```
GitHub Release 公開
  │
  ├── npm ci
  ├── npm run build (client + server)
  ├── npm run build:desktop (electron-builder)
  │     └── Windows NSIS / portable EXE 生成
  └── Release にアーティファクト (*.exe) をアップロード
```

> **注意**: macOS / Linux ビルドは GitHub-hosted runner で追加可能ですが、現在は Windows のみ対象です。
