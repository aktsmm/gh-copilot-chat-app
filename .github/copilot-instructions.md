# Repository Copilot Instructions

## 基本方針

- 変更前に関連ファイルを読み、既存実装パターンに合わせて最小差分で修正する。
- 変更後は可能な範囲で `typecheck` / `build` などの既存チェックを実行する。
- 破壊的操作（本番データ削除・無断の `git push`）は行わない。

## ワークフロー

- 非自明タスクは `manage_todo_list` で進捗を管理する。
- 失敗時は原因を明示し、再現可能な修正手順でリトライする。

## 参照

- セッション学習: `.github/review-learnings.md`
