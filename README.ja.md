# gh-copilot-chat-app

> 非公式のコミュニティプロジェクトです。GitHub 公式とは提携していません。

> GitHub Copilot SDK を使った、Claude / ChatGPT ライクなモダンチャットインターフェース

## Language / 言語

- 日本語: このファイル（README.ja.md）
- English: [README.md](README.md)

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Copilot SDK](https://img.shields.io/badge/Copilot_SDK-GA-22c55e)

## デモ

|                  Advanced モード                  |                 Simple モード                 |
| :-----------------------------------------------: | :-------------------------------------------: |
| ![Advanced モード](images/demo-chat-advanced.png) | ![Simple モード](images/demo-simple-mode.png) |

|               CI/CD ワークフローテスト               |
| :--------------------------------------------------: |
| ![ワークフローテスト](images/demo-workflow-test.png) |

## 特徴

- **リアルタイムストリーミング** — Socket.IO でトークン単位の即時表示
- **マルチセッション** — サイドバーで複数の会話を同時管理
- **コードハイライト** — Prism.js によるシンタックスハイライト + コピーボタン
- **Markdown 完全対応** — GFM テーブル、リスト、リンクなど
- **ツール実行可視化** — Copilot がツールを使っている様子をリアルタイム表示
- **モデル選択** — GPT-4.1、Claude Sonnet 4、o3-mini など
- **最新モデル候補** — `models:list` 取得 + フォールバックで新しめモデルを選択可能
- **Agent Mode 切替** — `interactive / plan / autopilot` を会話単位で切替
- **Reasoning Effort** — 対応モデルで推論強度（low〜xhigh）を選択
- **会話ごとのツール制限** — allow / exclude を会話単位で動的に切替
- **カテゴリ絞り込み** — ツール選択時にカテゴリ別で候補を絞り込み
- **Fleet Research** — Deep Research 送信時に Fleet 機能を優先利用
- **コンテキスト圧縮** — セッション圧縮をUIから明示実行
- **運用可視化** — 利用可能ツール数とクォータ残量を表示
- **音声入力** — Web Speech API でハンズフリー入力
- **言語切替** — 日本語 / English の UI 切替
- **Skills 導線** — 検索可能な Skill 実行（Deep Research を含む）
- **BYOK 対応** — OpenAI / Azure / Anthropic の自前 API キーも利用可
- **ダークモード** — 目に優しいモダンなダークテーマ
- **レスポンシブ** — サイドバー折りたたみ対応

## アーキテクチャ

```
┌─────────────────┐    WebSocket     ┌──────────────────┐    JSON-RPC    ┌─────────────┐
│  React Frontend │ ←──────────────→ │  Express Server  │ ←───────────→ │ Copilot CLI │
│  (Vite + TW)    │    Socket.IO     │  + Socket.IO     │    stdio      │ (Agent Core)│
└─────────────────┘                  └──────────────────┘               └─────────────┘
```

## セットアップ

### 🚀 クイックスタート（EXE インストーラー）

コードを触らずにすぐ使いたい方向けです。

> **仕組み**: このアプリは内部で **GitHub Copilot CLI**（`copilot` コマンド）を子プロセスとして起動し、GitHub の AI と通信します。
> そのため、EXE 単体では動作せず、**事前に Copilot CLI のインストールと認証が必要**です。

#### 必要なもの（事前準備）

| 必要なもの                        | 取得先                                                             | 備考                             |
| --------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| **Node.js 20+**                   | [nodejs.org](https://nodejs.org/)                                  | Copilot CLI のインストールに必要 |
| **GitHub Copilot CLI**            | `npm i -g @github/copilot`                                         | アプリが内部で使う通信エンジン   |
| GitHub アカウント                 | [github.com](https://github.com)                                   | 無料                             |
| GitHub Copilot サブスクリプション | [github.com/features/copilot](https://github.com/features/copilot) | Free プランあり                  |

#### ① Node.js をインストール

[Node.js 公式サイト](https://nodejs.org/) から **LTS** をダウンロードしてインストールします。
既に入っている場合はスキップしてください（`node --version` で確認できます）。

#### ② GitHub Copilot CLI をインストール・認証

```powershell
# Copilot CLI をグローバルインストール
npm i -g @github/copilot

# 認証（ブラウザが開いてログインするだけ）
copilot auth login

# 動作確認
copilot --version
```

#### ③ インストーラーをダウンロード

[Releases ページ](https://github.com/aktsmm/gh-copilot-chat-app/releases/latest) から
`GitHub Copilot Chat Setup <バージョン>.exe` をダウンロードして実行します。

```
GitHub Copilot Chat Setup x.x.x.exe  ← これをダブルクリック
```

> Windows SmartScreen が警告を出した場合は「詳細情報」→「実行」を選んでください。

#### ④ 起動する

インストール完了後、デスクトップまたはスタートメニューの **GitHub Copilot Chat** をクリックすれば起動します。

#### うまく動かない場合

| 症状                         | 対処                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| `copilot: command not found` | ① ② を再確認。ターミナルを再起動すると PATH が反映されることも |
| `node: command not found`    | ① で Node.js をインストールしてからやり直し                    |
| 認証エラー                   | `copilot auth login` を再実行                                  |
| 画面が真っ白                 | タスクバーのアイコンを右クリック → 再起動                      |

---

### 前提条件

1. **Node.js 20+**
2. **GitHub Copilot CLI** がインストール済み & 認証済み
   ```bash
   npm i -g @github/copilot
   copilot auth login
   ```
3. **GitHub Copilot サブスクリプション**（Free / Pro / Business / Enterprise）
   - または BYOK（自前の API キー）

### インストール

```bash
# クローン
git clone <this-repo>
cd gh-copilot-chat-app

# 依存関係インストール（ワークスペース一括）
npm install

# 起動前チェック（推奨）
npm run preflight

# 環境変数を設定（オプション）
cp .env.example .env
# Windows (PowerShell) の場合
Copy-Item .env.example .env
# .env を編集して GITHUB_TOKEN 等を設定
```

### 開発モード

```bash
npm run preflight
npm run dev
```

サーバー (http://127.0.0.1:3001) とクライアント (http://127.0.0.1:5173) が同時に起動します。
Vite の開発プロキシにより、フロントエンドから API / WebSocket 接続が自動的にサーバーに転送されます。

### 接続スモーク検証（`VITE_SERVER_URL`）

```bash
# 既定設定（Vite proxy 経由）
npm run smoke:vite-server-url

# 接続先を明示して確認（PowerShell）
$env:VITE_SERVER_URL='http://127.0.0.1:3001'; npm run smoke:vite-server-url
```

このコマンドは `server/client` を一時起動し、`/api/health` と `/socket.io` の疎通を検証したあと自動終了します。

### プロダクションビルド

```bash
npm run build
npm start
```

## 公開前チェック（推奨）

以下を満たしてから公開すると安全です。

1. 品質確認
   - `npm run typecheck`
   - `npm run test -w server`
2. デスクトップ配布物の更新（Windows）
   - `npm run build:desktop`
   - 生成物: `desktop/dist/GitHub Copilot Chat Setup <version>.exe`
3. 機密情報の確認
   - `.env` / APIキー / 個人用トークンが含まれていないこと
4. 変更差分の確認
   - 一時ファイル（`.tmp*` など）やローカル検証ログを含めないこと

### Release Assets 運用（推奨）

- 配布物（EXE）はリポジトリへコミットせず、GitHub Release Assets として添付します。
- `Release published` 時に [release-desktop-assets.yml](.github/workflows/release-desktop-assets.yml) が自動で `npm run build:desktop` を実行し、以下を添付します。
  - `GitHub Copilot Chat Setup <version>.exe`
  - `GitHub Copilot Chat Setup <version>.exe.blockmap`
  - `GitHub Copilot Chat <version>.exe`（portable）
- 手動実行の場合は workflow_dispatch で `tag` を指定してください。

## プロジェクト構成

```
.
├── client/                  # React フロントエンド
│   ├── src/
│   │   ├── components/      # UI コンポーネント
│   │   │   ├── ChatArea.tsx       # メッセージ表示エリア
│   │   │   ├── ChatInput.tsx      # 入力欄
│   │   │   ├── CodeBlock.tsx      # コードブロック + ハイライト
│   │   │   ├── MessageBubble.tsx  # 会話バブル
│   │   │   ├── Sidebar.tsx        # サイドバー
│   │   │   ├── StreamingBubble.tsx# ストリーミング表示
│   │   │   ├── ToolCallIndicator.tsx # ツール実行表示
│   │   │   ├── TypingIndicator.tsx   # タイピングアニメーション
│   │   │   └── WelcomeScreen.tsx     # ウェルカム画面
│   │   ├── lib/
│   │   │   ├── socket.ts         # Socket.IO クライアント
│   │   │   ├── store.ts          # グローバル状態管理
│   │   │   ├── types.ts          # 型定義
│   │   │   └── useChat.ts        # チャット操作フック
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── vite.config.ts
│
├── server/                  # Express + Socket.IO バックエンド
│   └── src/
│       ├── copilot/
│       │   ├── client-manager.ts  # CopilotClient ライフサイクル管理
│       │   └── session-manager.ts # セッション管理
│       ├── routes/
│       │   └── api.ts             # REST API ルート
│       ├── socket/
│       │   └── handlers.ts        # Socket.IO イベントハンドラ
│       ├── config.ts              # 環境変数 / 設定
│       └── index.ts               # エントリーポイント
│
├── .env.example             # 環境変数テンプレート
└── package.json             # ワークスペースルート
```

## 環境変数

| 変数                                   | 説明                                           | デフォルト                                                                                                                    |
| -------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                 | サーバーポート                                 | `3001`                                                                                                                        |
| `HOST`                                 | サーバーバインド先ホスト                       | `127.0.0.1`                                                                                                                   |
| `SERVER_ACCESS_TOKEN`                  | API / Socket 接続用アクセストークン            | （未設定）                                                                                                                    |
| `REQUIRE_ACCESS_TOKEN`                 | 接続トークン必須化 (`true/false`)              | `HOST` が非ローカルなら `true`、ローカルなら `false`                                                                          |
| `VITE_SERVER_ACCESS_TOKEN`             | クライアントが送信する接続トークン             | （未設定）                                                                                                                    |
| `GITHUB_TOKEN`                         | GitHub 認証トークン                            | (gh CLI から自動取得)                                                                                                         |
| `BYOK_PROVIDER`                        | BYOK: `openai` / `azure` / `anthropic`         | —                                                                                                                             |
| `BYOK_API_KEY`                         | BYOK: API キー                                 | —                                                                                                                             |
| `BYOK_BASE_URL`                        | BYOK: API ベース URL                           | —                                                                                                                             |
| `VITE_SERVER_URL`                      | クライアント接続先（開発時のproxy先）          | `http://127.0.0.1:3001`                                                                                                       |
| `CORS_ORIGINS`                         | CORS許可オリジン（`,` 区切り）                 | `http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173,http://localhost:3001,http://127.0.0.1:3001,http://[::1]:3001` |
| `COPILOT_CLI_PATH`                     | Copilot CLI のパス                             | `copilot`                                                                                                                     |
| `COPILOT_LOG_LEVEL`                    | ログレベル                                     | `info`                                                                                                                        |
| `ENABLE_WEB_SEARCH_FALLBACK`           | Web検索フォールバック有効化 (`true/false`)     | 開発環境 `true`、本番 `false`                                                                                                 |
| `WEB_SEARCH_FALLBACK_MODEL`            | フォールバック実行モデル                       | `gpt-5-mini`                                                                                                                  |
| `WEB_SEARCH_FALLBACK_TIMEOUT_MS`       | フォールバックCLIタイムアウト（ms）            | `90000`                                                                                                                       |
| `WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS`   | URL制限を無効化して全URL許可 (`true/false`)    | `false`                                                                                                                       |
| `WEB_SEARCH_FALLBACK_ALLOWED_URLS`     | 許可URL/ドメイン（`,`区切り）                  | `weather.gov,www.jma.go.jp,tenki.jp,www.bbc.com,www.reuters.com,apnews.com,www.nhk.or.jp,www.nikkei.com`                      |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCATION` | 地域未指定時の優先地域（例: `Tokyo, Japan`）   | （未設定）                                                                                                                    |
| `WEB_SEARCH_FALLBACK_DEFAULT_LOCALE`   | 地域推定の優先ロケール（例: `ja-JP`）          | （未設定）                                                                                                                    |
| `WEB_SEARCH_FALLBACK_DEFAULT_TIMEZONE` | 地域推定の既定タイムゾーン（例: `Asia/Tokyo`） | （未設定）                                                                                                                    |
| `STRICT_TOOL_PERMISSIONS`              | ツール権限の厳格モード (`true/false`)          | 非ローカル運用時 `true`、ローカル運用時 `false`                                                                               |
| `PERMISSION_ALLOW_KINDS`               | 許可する権限種別（`,`区切り）                  | `read,url,mcp`                                                                                                                |

### Web Search Fallback 許可ドメイン運用基準

- `WEB_SEARCH_FALLBACK_ALLOWED_URLS` は最小権限の原則で運用し、既定は公共性・一次情報性の高いドメインのみを維持します。
- 追加時は「利用目的」「情報の一次性」「運用継続性（閉鎖/移転リスク）」を PR 説明に明記し、少なくとも1名のレビューを必須にしてください。
- 削除時は依存するユースケース（天気/ニュース等）への影響を確認し、必要なら代替ドメインを同時提案してください。
- 例外的に全URL許可が必要な検証は `WEB_SEARCH_FALLBACK_ALLOW_ALL_URLS=true` をローカル限定で使用し、共有環境/本番では無効のままにしてください。

### CORS 運用ポリシー（推奨）

- 開発環境は既定のローカル許可リスト（`localhost / 127.0.0.1 / [::1]`）を利用できます。
- 本番環境では `CORS_ORIGINS` に **明示的なオリジンのみ** を設定してください（`*` は非推奨かつサーバー起動時に拒否されます）。
- 設定値は `http(s)://host[:port]` 形式のみ有効です。無効値は起動時に除外されます。
- `CORS_ORIGINS` を設定した場合、すべて無効値だとサーバーは起動時エラーになります。
- 開発環境（`NODE_ENV != production`）では、上記に加えて `localhost / 127.0.0.1 / [::1]` の任意ポートを許可します。

### API / Socket アクセス制御

- `HOST` が `127.0.0.1 / localhost / ::1` 以外の場合、`SERVER_ACCESS_TOKEN`（または `ACCESS_TOKEN`）が必須です。
- `REQUIRE_ACCESS_TOKEN=true` を指定した場合、ローカル運用でもトークン必須になります。
- クライアント利用時は `VITE_SERVER_ACCESS_TOKEN` に同じ値を設定すると Socket 接続時に自動送信されます。
- トークンは `Authorization: Bearer <token>` または `x-access-token` でも利用できます。

### ツール権限ポリシー

- `STRICT_TOOL_PERMISSIONS=true` では Copilot の permission request を制限し、既定で `read,url,mcp` のみ許可します。
- 許可範囲は `PERMISSION_ALLOW_KINDS` で上書きできます（例: `read,url,mcp,shell`）。
- 既定値は「非ローカル運用時に厳格モード有効、ローカル運用時は互換性優先」です。

## Socket.IO イベント仕様

### Client → Server

| イベント              | ペイロード                                                                                            | 説明               |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| `chat:create`         | `{ model?, mode?, reasoningEffort?, availableTools?, excludedTools?, systemMessage?, title? }`        | 新規セッション作成 |
| `chat:send`           | `{ sessionId, prompt, mode?, startFleet?, preferredLocation?, preferredLocale?, locale?, timeZone? }` | メッセージ送信     |
| `chat:abort`          | `{ sessionId }`                                                                                       | 生成中止           |
| `sessions:list`       | —                                                                                                     | セッション一覧     |
| `session:delete`      | `{ sessionId }`                                                                                       | セッション削除     |
| `session:rename`      | `{ sessionId, title }`                                                                                | セッション名変更   |
| `session:mode`        | `{ sessionId, mode? }`                                                                                | モード取得/変更    |
| `session:tools`       | `{ sessionId, availableTools?, excludedTools? }`                                                      | ツール制限更新     |
| `session:compact`     | `{ sessionId }`                                                                                       | コンテキスト圧縮   |
| `session:fleet_start` | `{ sessionId, prompt? }`                                                                              | Fleet 開始         |
| `models:list`         | —                                                                                                     | 利用可能モデル一覧 |
| `tools:list`          | `{ model? }`                                                                                          | 利用可能ツール一覧 |
| `account:quota`       | —                                                                                                     | クォータ取得       |

### Server → Client

| イベント              | ペイロード                                                                                        | 説明                   |
| --------------------- | ------------------------------------------------------------------------------------------------- | ---------------------- |
| `chat:delta`          | `{ sessionId, content }`                                                                          | ストリーミングチャンク |
| `chat:message`        | `{ sessionId, content, role, messageId, source?, sourceModel? }`                                  | 完了メッセージ         |
| `chat:tool_start`     | `{ sessionId, toolName, toolCallId }`                                                             | ツール実行開始         |
| `chat:tool_done`      | `{ sessionId, toolName, toolCallId, output, success }`                                            | ツール実行完了         |
| `chat:idle`           | `{ sessionId }`                                                                                   | 処理完了               |
| `chat:error`          | `{ sessionId, error, errorCode }`                                                                 | エラー                 |
| `chat:created`        | `{ sessionId, model, mode, reasoningEffort?, availableTools?, excludedTools?, title, createdAt }` | セッション作成完了     |
| `chat:mode`           | `{ sessionId, mode }`                                                                             | モード変更通知         |
| `chat:tools_updated`  | `{ sessionId, availableTools?, excludedTools? }`                                                  | ツール制限更新通知     |
| `chat:fleet_started`  | `{ sessionId, mode }`                                                                             | Fleet 開始通知         |
| `chat:compacted`      | `{ sessionId, success, tokensRemoved, messagesRemoved }`                                          | 圧縮完了通知           |
| `chat:title`          | `{ sessionId, title }`                                                                            | タイトル自動更新       |
| `chat:subagent_start` | `{ sessionId, agentName }`                                                                        | サブエージェント開始   |
| `chat:subagent_done`  | `{ sessionId, agentName }`                                                                        | サブエージェント完了   |

## CLI リリースノート連動の自動PR

CLI の新しい Release が出たら、既定モデル候補の更新とリリースレポート生成を自動でPR化できます。

- ワークフロー: `.github/workflows/cli-release-auto-pr.yml`
- 実行スクリプト: `scripts/cli-release-automation.mjs`
- 状態ファイル: `.github/automation/cli-release-state.json`
- 生成レポート: `reports/YYYYMMDD-cli-release-<tag>.md`

### 実行トリガー

- 定期実行: 8時間ごと（`schedule`）
- 手動実行: `workflow_dispatch`

### 設定

- 既定の監視先レポ: `github/copilot-cli`
- 変更したい場合は以下のどちらかを設定
  - `workflow_dispatch` の `releaseRepo` 入力
  - Repository Variables の `CLI_RELEASE_REPO`

### ローカル動作確認

```bash
npm run automation:cli-release
```

新しいリリースが検知された場合に、以下が更新されます。

- `client/src/lib/store.ts` の `DEFAULT_MODELS`
- `client/src/lib/useChat.ts` の `FALLBACK_MODELS`
- `.github/automation/cli-release-state.json`
- `reports/` 配下のリリースレポート

公開レポジトリ化後は、`GITHUB_TOKEN` のデフォルト権限を `contents: write` / `pull-requests: write` の最小権限で運用してください。

## 技術スタック

- **Frontend**: React 19, Vite 6, TailwindCSS 3, Lucide Icons
- **Backend**: Express 5, Socket.IO 4, tsx (dev runner)
- **SDK**: `@github/copilot-sdk` (GA)
- **Language**: TypeScript 5.7, ESM

## ライセンス

MIT
