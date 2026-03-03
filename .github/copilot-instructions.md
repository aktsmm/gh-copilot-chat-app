---
applyTo: "**"
---

# Repository Copilot Instructions

## プロジェクト概要

GitHub Copilot SDK (GA) を使った非公式チャット GUI。
Node.js monorepo（npm workspaces）で **client / server / desktop** の3パッケージ構成。

| パッケージ | 役割 | 主要技術 |
|-----------|------|---------|
| `client/` | Web フロントエンド | React + Vite + Tailwind CSS |
| `server/` | バックエンド API + Copilot セッション管理 | Express + Socket.IO + Copilot SDK |
| `desktop/` | Electron デスクトップラッパー | Electron（サーバー内蔵） |

## ポート規約

| ポート | 用途 |
|-------|------|
| `3001` | `npm run dev` 時の開発サーバー |
| `5173` | Vite 開発サーバー（client） |
| `3002` | デスクトップ（Electron）embedded-server |

## 主要コマンド

```bash
npm run dev            # server + client 同時起動（開発）
npm run dev:desktop    # client ビルド → Electron 起動
npm run typecheck      # 全パッケージ型チェック（CI 相当）
npm run build          # client + server プロダクションビルド
npm run build:desktop  # EXE / DMG / AppImage 生成
npm run clean          # dist / cache 一括削除
```

## 基本方針

- 変更前に関連ファイルを読み、既存実装パターンに合わせて最小差分で修正する。
- 変更後は `npm run typecheck` を実行し、エラーがないことを確認する。
- 破壊的操作（本番データ削除・無断の `git push`）は行わない。

## ワークフロー

- 非自明タスクは `manage_todo_list` で進捗を管理する。
- 失敗時は原因を明示し、再現可能な修正手順でリトライする。

## 参照

- セッション学習: `.github/review-learnings.md`
