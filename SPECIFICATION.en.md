# GitHub Copilot Chat GUI — Specification

> **Version**: 1.0.0 | **Last updated**: 2026-03-04

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Server Specification](#2-server-specification)
  - [2.1 REST API](#21-rest-api)
  - [2.2 Socket.IO Events](#22-socketio-events)
  - [2.3 Environment Variables](#23-environment-variables)
  - [2.4 Copilot Client Management](#24-copilot-client-management)
  - [2.5 Session Management](#25-session-management)
  - [2.6 Web Search Fallback](#26-web-search-fallback)
  - [2.7 Error Code System](#27-error-code-system)
- [3. Client Specification](#3-client-specification)
  - [3.1 State Management](#31-state-management)
  - [3.2 Type Definitions](#32-type-definitions)
  - [3.3 Chat Hook](#33-chat-hook)
  - [3.4 Socket Connection](#34-socket-connection)
  - [3.5 Internationalization (i18n)](#35-internationalization-i18n)
  - [3.6 Skill System](#36-skill-system)
  - [3.7 UI Modes](#37-ui-modes)
- [4. Desktop (Electron) Specification](#4-desktop-electron-specification)
  - [4.1 Main Process](#41-main-process)
  - [4.2 Embedded Server](#42-embedded-server)
- [5. Shared Modules](#5-shared-modules)
- [6. Build System](#6-build-system)
- [7. Security Model](#7-security-model)

---

## 1. Architecture Overview

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

### Package Structure

| Package     | Path       | Role                                     | Key Technologies                    |
| ----------- | ---------- | ---------------------------------------- | ----------------------------------- |
| **client**  | `client/`  | Web frontend                             | React 19 + Vite 6 + Tailwind CSS    |
| **server**  | `server/`  | Backend API + Copilot session management | Express 5 + Socket.IO + Copilot SDK |
| **desktop** | `desktop/` | Electron desktop wrapper                 | Electron 35 + embedded server       |
| **shared**  | `shared/`  | Shared type definitions & constants      | TypeScript + JavaScript             |

### Communication Flow

```
User input → React UI → Socket.IO (chat:send)
    → Express Server → CopilotClient → Copilot CLI (child process)
    → GitHub Copilot API → Streaming response
    → chat:delta / chat:message → Rendered in React UI
```

### Port Conventions

| Port   | Usage                            |
| ------ | -------------------------------- |
| `3001` | Development mode (`npm run dev`) |
| `5173` | Vite dev server (client HMR)     |
| `3002` | Desktop Electron embedded server |

---

## 2. Server Specification

### 2.1 REST API

All endpoints require `Authorization: Bearer <token>` or `X-Access-Token` header when `config.security.requireAccessToken === true`.

| Method   | Path                | Description                                  | Example Response                         |
| -------- | ------------------- | -------------------------------------------- | ---------------------------------------- |
| `GET`    | `/api/health`       | Health check                                 | `{ status: "ok", timestamp: "..." }`     |
| `GET`    | `/api/sessions`     | List all sessions (session object excluded)  | `[{ id, model, title, createdAt, ... }]` |
| `DELETE` | `/api/sessions/:id` | Delete session (SDK destroy + deleteSession) | `{ ok: true }`                           |
| `PATCH`  | `/api/sessions/:id` | Rename session                               | `{ ok: true }`                           |
| `GET`    | `/api/models`       | List available models                        | `[{ id, name, ... }]`                    |
| `GET`    | `/api/auth`         | Check authentication status                  | `{ authenticated: true, ... }`           |
| `GET`    | `/api/status`       | Client state and session count               | `{ state: "connected", sessions: 3 }`    |
| `GET`    | `/api/workspace`    | Workspace path information                   | `{ cwd: "...", reports: "..." }`         |

### 2.2 Socket.IO Events

#### Client → Server (Requests)

| Event                 | Payload                                                                                               | Description               |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------- |
| `chat:create`         | `{ model?, mode?, reasoningEffort?, availableTools?, excludedTools?, systemMessage?, title? }`        | Create new session        |
| `chat:send`           | `{ sessionId, prompt, mode?, startFleet?, preferredLocation?, preferredLocale?, locale?, timeZone? }` | Send message              |
| `chat:abort`          | `{ sessionId }`                                                                                       | Abort generation          |
| `sessions:list`       | `{}`                                                                                                  | List sessions             |
| `session:delete`      | `{ sessionId }`                                                                                       | Delete session            |
| `session:rename`      | `{ sessionId, title }`                                                                                | Rename session            |
| `session:mode`        | `{ sessionId, mode? }`                                                                                | Get/set agent mode        |
| `session:model`       | `{ sessionId, model }`                                                                                | Change model              |
| `session:tools`       | `{ sessionId, availableTools?, excludedTools? }`                                                      | Change tool policy        |
| `session:compact`     | `{ sessionId }`                                                                                       | Compact context           |
| `session:fleet_start` | `{ sessionId, prompt? }`                                                                              | Start Fleet/Research mode |
| `models:list`         | `{}`                                                                                                  | List models               |
| `tools:list`          | `{ model? }`                                                                                          | List tools                |
| `account:quota`       | `{}`                                                                                                  | Get quota info            |

#### Server → Client (Push)

| Event                 | Payload                                                                                           | Description                     |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| `chat:delta`          | `{ sessionId, content }`                                                                          | Streaming token delta           |
| `chat:message`        | `{ sessionId, content, role, messageId, source?, sourceModel? }`                                  | Complete message                |
| `chat:tool_start`     | `{ sessionId, toolName, toolCallId }`                                                             | Tool execution started          |
| `chat:tool_done`      | `{ sessionId, toolName, toolCallId, output, success }`                                            | Tool execution completed        |
| `chat:idle`           | `{ sessionId }`                                                                                   | Generation complete (idle)      |
| `chat:error`          | `{ sessionId, error, errorCode }`                                                                 | Error notification              |
| `chat:created`        | `{ sessionId, model, mode, reasoningEffort?, availableTools?, excludedTools?, title, createdAt }` | Session created                 |
| `chat:title`          | `{ sessionId, title }`                                                                            | SDK automatic title change      |
| `chat:mode`           | `{ sessionId, mode }`                                                                             | Mode change notification        |
| `chat:model`          | `{ sessionId, model }`                                                                            | Model change notification       |
| `chat:tools_updated`  | `{ sessionId, availableTools?, excludedTools? }`                                                  | Tool policy change notification |
| `chat:compacted`      | `{ sessionId, success, tokensRemoved, messagesRemoved }`                                          | Context compaction result       |
| `chat:fleet_started`  | `{ sessionId, mode }`                                                                             | Fleet Research started          |
| `chat:subagent_start` | `{ sessionId, agentName }`                                                                        | Sub-agent started               |
| `chat:subagent_done`  | `{ sessionId, agentName }`                                                                        | Sub-agent completed             |

### 2.3 Environment Variables

#### Server Basics

| Variable       | Default             | Description                                           |
| -------------- | ------------------- | ----------------------------------------------------- |
| `PORT`         | `3001`              | Server port (1–65535)                                 |
| `HOST`         | `127.0.0.1`         | Bind host                                             |
| `CORS_ORIGINS` | 6 localhost origins | Allowed CORS origins (comma-separated, `*` forbidden) |
| `NODE_ENV`     | —                   | `"production"` changes some behaviors                 |

#### Security

| Variable                               | Default                      | Description                       |
| -------------------------------------- | ---------------------------- | --------------------------------- |
| `SERVER_ACCESS_TOKEN` / `ACCESS_TOKEN` | —                            | API access token                  |
| `REQUIRE_ACCESS_TOKEN`                 | `true` for non-loopback      | Require token authentication      |
| `STRICT_TOOL_PERMISSIONS`              | Same as `requireAccessToken` | Strict tool execution permissions |
| `PERMISSION_ALLOW_KINDS`               | `"read,url,mcp"`             | Allowed permission kinds          |

Configurable permission kinds: `shell`, `write`, `mcp`, `read`, `url`, `custom-tool`

#### GitHub / BYOK Authentication

| Variable                                             | Default | Description                                      |
| ---------------------------------------------------- | ------- | ------------------------------------------------ |
| `GITHUB_TOKEN` / `GH_TOKEN` / `COPILOT_GITHUB_TOKEN` | —       | GitHub auth token                                |
| `BYOK_PROVIDER`                                      | —       | BYOK provider (`openai` / `azure` / `anthropic`) |
| `BYOK_API_KEY`                                       | —       | BYOK API key                                     |
| `BYOK_BASE_URL`                                      | —       | BYOK base URL                                    |
| `BYOK_MODEL`                                         | —       | BYOK model                                       |

#### Copilot CLI

| Variable            | Default       | Description                 |
| ------------------- | ------------- | --------------------------- |
| `COPILOT_CLI_PATH`  | Auto-detected | Copilot CLI executable path |
| `COPILOT_LOG_LEVEL` | `"info"`      | SDK log level               |

#### Web Search Fallback

| Variable                               | Default                  | Description                                     |
| -------------------------------------- | ------------------------ | ----------------------------------------------- |
| `ENABLE_WEB_SEARCH_FALLBACK`           | `true` in non-production | Enable fallback                                 |
| `WEB_SEARCH_FALLBACK_MODEL`            | `"gpt-5-mini"`           | Fallback model                                  |
| `WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS`   | `false`                  | Allow all URLs (not recommended for production) |
| `WEB_SEARCH_FALLBACK_ALLOWED_URLS`     | 8 weather/news sites     | Allowed host list                               |
| `WEB_SEARCH_FALLBACK_TIMEOUT_MS`       | `90000`                  | Timeout (ms)                                    |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCATION` | —                        | Default weather location                        |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCALE`   | —                        | Default locale                                  |
| `WEB_SEARCH_FALLBACK_DEFAULT_TIMEZONE` | —                        | Default timezone                                |

#### Observability

| Variable                            | Default | Description                     |
| ----------------------------------- | ------- | ------------------------------- |
| `CHAT_ERROR_UNKNOWN_WARN_THRESHOLD` | `10`    | UNKNOWN error warning threshold |

### 2.4 Copilot Client Management

Uses a **singleton pattern** to maintain a single `CopilotClient` instance.

```
getClient()
  ├── Connected → return as-is
  ├── Stale (not connected) → stop() → recreate
  └── Not created → create new
```

**CopilotClient options:**

- `autoStart: true` — Auto-start
- `autoRestart: true` — Auto-restart
- `cliPath` — CLI executable path (auto-detected or from environment variable)
- `logLevel` — SDK log level
- `githubToken` — GitHub auth token (optional)

**BYOK support:**
`buildProviderConfig()` constructs `{ type, baseUrl, apiKey }` and passes it to the Copilot SDK's provider option.

### 2.5 Session Management

In-memory management using `Map<string, SessionEntry>`.

#### SessionEntry Structure

```typescript
{
  id: string;              // UUID v4
  session: CopilotSession; // SDK session object
  model: string;           // Model ID in use
  createdAt: Date;
  lastUsed: Date;
  title: string;
  mode: AgentMode;         // "interactive" | "plan" | "autopilot"
  reasoningEffort?: SessionReasoningEffort; // "low"|"medium"|"high"|"xhigh"
  availableTools?: string[];
  excludedTools?: string[];
}
```

#### Lifecycle

1. **Create** — `createSession()`: Generate UUID → Build `SessionConfig` → `client.createSession()` → Set mode (`session.rpc.mode.set`)
2. **Resume** — `resumeSession()`: Return existing if available, otherwise `client.resumeSession()` to restore
3. **Reconfigure** — `reconfigureSessionTools()`: Get new instance via `client.resumeSession()` → Update model/tool settings
4. **Delete** — `deleteSession()`: `session.destroy()` → `client.deleteSession()` → Remove from Map

#### Session Configuration

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
  provider?: ProviderConfig; // BYOK only
}
```

#### Permission Handler

- `strictToolPermissions = false` → Approve all (`approveAll`)
- `strictToolPermissions = true` → Approve only if kind is in `allowedPermissionKinds`

### 2.6 Web Search Fallback

A mechanism that directly invokes the Copilot CLI to fetch search results when the session's model/tool configuration doesn't support web search tools.

#### Processing Flow

```
chat:send received
  → isLikelyWebSearchPrompt() — evaluate prompt
  → isWebSearchToolAvailable() — check tool availability
  → No tool && search-like prompt → Execute fallback
    → buildWebSearchPrompt() — construct prompt
    → Launch copilot CLI via execFile()
    → Save result as carryover in session
    → Attach as additional context on next message send
```

#### Prompt Detection Keywords

weather / latest / news / search / today / stock price / 天気 / 最新 / ニュース / 検索 / 今日 / 株価 etc.

#### Recognized Web Search Tool Names

`web_search`, `brave_web_search`, `bing_web_search`, `bing_search`, `mcp_brave-search_brave_web_search`, `mcp_brave-search_brave_news_search`, `mcp_brave-search_brave_local_search`

#### Default Allowed URLs

`weather.gov`, `www.jma.go.jp`, `tenki.jp`, `www.bbc.com`, `www.reuters.com`, `apnews.com`, `www.nhk.or.jp`, `www.nikkei.com`

#### Location Inference Logic

`inferDefaultWeatherLocation()`: Infers from `preferredLocation` → `locale` → `timezone` in priority order.

### 2.7 Error Code System

#### ChatErrorCode List

| Code                    | Trigger Condition                                            |
| ----------------------- | ------------------------------------------------------------ |
| `INVALID_REQUEST`       | Invalid sessionId / prompt / model / mode                    |
| `SESSION_NOT_FOUND`     | Specified session does not exist                             |
| `MODE_SWITCH_FAILED`    | Agent mode switch failure                                    |
| `FLEET_UNAVAILABLE`     | Research mode not supported                                  |
| `FLEET_START_FAILED`    | Fleet start failure                                          |
| `SEND_FAILED`           | Message send failure                                         |
| `CREATE_SESSION_FAILED` | Session creation failure                                     |
| `MODEL_LIST_FAILED`     | Model list retrieval failure                                 |
| `TOOLS_LIST_FAILED`     | Tool list retrieval failure                                  |
| `SESSION_ERROR`         | Generic session error                                        |
| `CLI_NOT_FOUND`         | Copilot CLI not found                                        |
| `CLI_SPAWN_FAILED`      | CLI process spawn failure (EINVAL / ENOENT / EACCES / EPERM) |
| `CLI_NOT_CONNECTED`     | CLI not connected                                            |
| `AUTH_REQUIRED`         | Authentication required                                      |
| `UNKNOWN`               | Unclassifiable (warning output when threshold exceeded)      |

#### Error Processing Flow

```
Error occurs
  → classifyChatErrorCode()  // Auto-classify from normalized message text
  → recordChatErrorMetric()  // Count in Map<ChatErrorCode, number>
  → emitChatError()          // Send chat:error event
```

When UNKNOWN error count exceeds the threshold (default 10), a `console.error` warning is emitted.

---

## 3. Client Specification

### 3.1 State Management

**No Zustand** — Uses `useSyncExternalStore`, a React 19-native external store.

#### ChatState Structure

```typescript
interface ChatState {
  // --- Conversation data ---
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

  // --- Catalogs ---
  modelCatalog: ModelInfoLite[];
  availableToolsCatalog: ToolInfoLite[];
  quotaSnapshots: Record<string, QuotaSnapshot>;
  availableModels: string[];

  // --- User preferences (persisted to localStorage) ---
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

#### Persistence

Stored in `localStorage` key `ghc-chat-settings-v1`:
`preferredModel`, `preferredAgentMode`, `preferredReasoningEffort`, `uiLanguage`, `themeMode`, `uiMode`, `userProfile`, `copilotPersona`

#### Model Display Filtering

- `gpt-5.1` → Normalized to `gpt-5`
- Names containing `o3`, `o3-*`, `-mini-` are hidden
- Older versions of same model series are filtered (GPT-5.x, Claude-\*-4.x)

### 3.2 Type Definitions

```typescript
// --- Basic types ---
type UiLanguage = "ja" | "en";
type ThemeMode = "dark" | "light";
type UiMode = "simple" | "advanced";
type AgentMode = "interactive" | "plan" | "autopilot";
type ReasoningEffort = "low" | "medium" | "high" | "xhigh";
type PreferredReasoningEffort = ReasoningEffort | "auto";
type ChatMessageSource = "default" | "web-search-fallback";

// --- Data models ---
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

// --- Catalogs ---
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

// --- Skills ---
interface SkillTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  recommendedModel?: string;
}
```

### 3.3 Chat Hook

`useChat()` — Custom hook managing the entire chat logic for the application.

#### Initialization Flow

```
Socket connected
  → requestCapabilities()
    → sessions:list  → Restore existing conversations
    → models:list    → Update model catalog
    → tools:list     → Update tool catalog
    → account:quota  → Get quota info
```

#### Real-time Event Listeners (12 events)

`chat:delta`, `chat:message`, `chat:idle`, `chat:tool_start`, `chat:tool_done`, `chat:error`, `chat:title`, `chat:mode`, `chat:model`, `chat:tools_updated`, `chat:compacted`, `chat:fleet_started`

#### Public Actions

| Action                        | Description                     |
| ----------------------------- | ------------------------------- |
| `createChat`                  | Create new chat                 |
| `sendMessage`                 | Send message                    |
| `abortGeneration`             | Abort generation                |
| `deleteChat`                  | Delete chat                     |
| `renameChat`                  | Rename chat                     |
| `switchChat`                  | Switch active chat              |
| `setConversationMode`         | Change agent mode               |
| `setConversationModel`        | Change model                    |
| `setConversationToolPolicy`   | Change tool policy              |
| `compactActiveSession`        | Compact context                 |
| `runSkill`                    | Execute skill template          |
| `quickConnectMcpByUrl`        | Quick connect to MCP server     |
| `setPreferredModel`           | Change default model            |
| `setPreferredAgentMode`       | Change default mode             |
| `setPreferredReasoningEffort` | Change default reasoning effort |
| `setUiLanguage`               | Change display language         |
| `setThemeMode`                | Change theme                    |
| `setUiMode`                   | Change UI mode                  |
| `setUserProfile`              | Change profile                  |
| `setCopilotPersona`           | Set persona                     |

#### Deep Research

`buildResearchPrompt()` generates a structured prompt:
Goal clarification → Research plan → Comparative analysis → Recommendations → Risk assessment

#### Locale Context

Auto-captures `navigator.language` + `Intl.DateTimeFormat().resolvedOptions().timeZone` and sends to server. Used for location inference in weather/news prompts.

### 3.4 Socket Connection

```typescript
// Singleton connection
const socket = io(serverUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: Infinity,
  auth: { token: accessToken }, // VITE_SERVER_ACCESS_TOKEN
});
```

**Server URL resolution:**

- If `VITE_SERVER_URL` environment variable is set, use it
- Otherwise `window.location.origin` (used in Electron embedded mode)

### 3.5 Internationalization (i18n)

- **Supported languages**: Japanese (`ja`) / English (`en`)
- **Key count**: ~120 keys
- **Categories**: App basics, sidebar, model/agent, tools, profile, MCP, theme, conversation actions, chat input, voice input, welcome screen, templates, persona
- **Function**: `t(language, key)` — Dictionary lookup
- **Voice input**: `languageToSpeechCode("ja")` → `"ja-JP"`, `languageToSpeechCode("en")` → `"en-US"`

### 3.6 Skill System

6 built-in templates:

| ID                | Title                     | Recommended Model | Purpose                     |
| ----------------- | ------------------------- | ----------------- | --------------------------- |
| `deep-research`   | Deep Research (CLI/Fleet) | `gpt-5`           | Structured research         |
| `security-review` | Security Review           | `gpt-5.3-codex`   | Security review             |
| `test-design`     | Test Design               | `gpt-4.1`         | Test design                 |
| `refactor-plan`   | Refactor Plan             | `claude-sonnet-4` | Refactoring plan            |
| `mcp-web-setup`   | MCP Setup (Web)           | `gpt-5`           | MCP web server connection   |
| `mcp-local-setup` | MCP Setup (Local)         | `gpt-5`           | MCP local server connection |

Each skill has bilingual (Japanese/English) prompts and is converted to `SkillTemplate[]` via `getSkills(language)`.

### 3.7 UI Modes

| Mode                     | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| **Simple** (`SimpleApp`) | Minimal UI. Lazy-loaded. Chat input and response display only            |
| **Advanced**             | Full-featured. Sidebar, settings, skills, tool management, quota display |

**Research-capable model detection**: Fleet Research is available for models matching `gpt-5*`, `claude-sonnet*`, `claude-opus*`.

---

## 4. Desktop (Electron) Specification

### 4.1 Main Process

#### Window Configuration

| Property         | Value                          |
| ---------------- | ------------------------------ |
| Size             | 1200 × 800 (minimum 600 × 400) |
| Background color | `#0d1117`                      |
| contextIsolation | `true`                         |
| nodeIntegration  | `false`                        |

#### Security

- **External links**: Only `http:` / `https:` opened via `shell.openExternal()`
- **In-app navigation**: Only `http://127.0.0.1:{port}` allowed
- **Multiple instances**: Prevented via `app.requestSingleInstanceLock()`

#### Menu

| Menu            | Action                                           |
| --------------- | ------------------------------------------------ |
| File → New Chat | `Ctrl+N` — Focus main window                     |
| File → Quit     | `Ctrl+Q` — Quit app                              |
| Edit            | undo / redo / cut / copy / paste / selectAll     |
| View            | reload / zoom / fullscreen / devTools (dev only) |
| Help → About    | Version info dialog                              |
| Help → GitHub   | Open repository in external browser              |

#### System Tray

- **Menu**: Show / Quit
- **Double-click**: Show window
- **Close button**: Minimize to tray unless quit flag is set

#### Global Shortcut

`Ctrl+Shift+C` — Toggle window visibility

#### Lifecycle

```
app.ready
  → startEmbeddedServer()
  → createWindow()
  → createMenu()
  → createTray()

app.before-quit
  → stopEmbeddedServer()
```

### 4.2 Embedded Server

Imports the Express + Socket.IO code from server/ and runs it directly within the Electron process.

| Property      | Value                                                           |
| ------------- | --------------------------------------------------------------- |
| Port          | `3002` (falls back to `0` = random if in use)                   |
| Host          | `127.0.0.1` (fixed)                                             |
| Client assets | packaged: `process.resourcesPath/client`, dev: `../client/dist` |

**CORS + Auth**: Reuses `isCorsOriginAllowed` and `hasValidAccessToken` from server/src/config. Additional `hasTrustedOrigin()` check.

**Shutdown**: `stopClient()` → `httpServer.close()`

---

## 5. Shared Modules

### chat-error-code

Defined in `shared/chat-error-code.js`; `shared/chat-error-code.d.ts` is auto-generated by `scripts/sync-chat-error-code-dts.mjs`.

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

This serves as the SSOT (Single Source of Truth) referenced by both server and client.

---

## 6. Build System

### npm Scripts (Root)

| Command                 | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Start server + client simultaneously (concurrently)  |
| `npm run dev:server`    | Start server only (tsx watch)                        |
| `npm run dev:client`    | Start client only (Vite dev server)                  |
| `npm run dev:desktop`   | Build client → Launch Electron                       |
| `npm run build`         | Production build for client + server                 |
| `npm run build:desktop` | Build client + server → Electron packaging           |
| `npm run start`         | Start server in production mode                      |
| `npm run clean`         | Delete all dist / cache (rimraf)                     |
| `npm run lint`          | Run ESLint                                           |
| `npm run typecheck`     | sync:chat-error-code-dts → tsc --noEmit × 3 packages |
| `npm run preflight`     | Pre-launch checks (CLI existence verification, etc.) |

### Dependencies

#### server

| Type    | Packages                                                                           |
| ------- | ---------------------------------------------------------------------------------- |
| Runtime | `@github/copilot-sdk`, `cors`, `dotenv`, `express` 5, `socket.io`, `uuid`, `zod`   |
| Dev     | `@types/cors`, `@types/express`, `@types/node`, `@types/uuid`, `tsx`, `typescript` |

#### client

| Type    | Packages                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Runtime | `lucide-react`, `react` 19, `react-dom` 19, `react-markdown`, `react-syntax-highlighter`, `remark-gfm`, `socket.io-client` |
| Dev     | `@tailwindcss/typography`, `@types/react*`, `@vitejs/plugin-react`, `autoprefixer`, `postcss`, `tailwindcss`, `vite` 6     |

#### desktop

| Type    | Packages                                                                                    |
| ------- | ------------------------------------------------------------------------------------------- |
| Runtime | `@github/copilot-sdk`, `cors`, `dotenv`, `electron-store`, `express` 5, `socket.io`, `uuid` |
| Dev     | `electron` 35, `electron-builder`, `rcedit`, `typescript`                                   |

### Electron Builder Configuration

| Property        | Value                        |
| --------------- | ---------------------------- |
| appId           | `com.copilot-chat.desktop`   |
| Windows         | NSIS + Portable              |
| macOS           | DMG                          |
| Linux           | AppImage + deb               |
| Extra Resources | `server/dist`, `client/dist` |

---

## 7. Security Model

### Access Control

```
Request received
  ├── Loopback address → No auth required (default)
  └── External access
       ├── requireAccessToken = true → Bearer token validation
       └── requireAccessToken = false → Pass through (not recommended)
```

### CORS

- `*` is explicitly forbidden
- By default, only 6 localhost-family origins are allowed
- Configurable via `CORS_ORIGINS` environment variable (comma-separated)

### Tool Permissions

```
Tool execution request
  ├── strictToolPermissions = false → Approve all
  └── strictToolPermissions = true
       ├── kind is in allowedPermissionKinds → Approve
       └── Not included → Deny
```

Default allowed: `read`, `url`, `mcp`
Requires explicit permission: `shell`, `write`, `custom-tool`

### Electron Security

- `contextIsolation: true` — Context isolation between renderer and main process
- `nodeIntegration: false` — No Node.js API access from renderer
- Navigation restricted to `127.0.0.1:{port}` only
- External links delegated to OS default browser via `shell.openExternal()`
