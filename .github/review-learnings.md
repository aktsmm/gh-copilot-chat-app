# Review Learnings

## Universal（汎用 — 他プロジェクトでも使える）

### U1: セッション単位の一時UI状態管理

- **Tags**: `設計` `バグ` `UI/UX`
- **Added**: 2026-03-03
- **Evidence**: 生成中に会話を切り替えると、ストリーム表示や停止状態が他セッションへ混線するリスクがあった。
- **Action**: 生成中フラグ・ストリームバッファ・ツール状態は会話ID単位で保持し、表示時に active 会話だけを参照する。

## Project-specific（このワークスペース固有）

### P1: Electron メニュー連携のDOMフック維持

- **Tags**: `UI/UX` `外部連携`
- **Added**: 2026-03-03
- **Evidence**: Electron 側 `executeJavaScript` は `[data-action=new-chat]` をクリックする仕様だったが、UI側に同属性がなく New Chat が無効化されていた。
- **Action**: New Chat ボタンに `data-action="new-chat"` を付与し、メニュー/ショートカット導線を維持する。

## Session Log

<!-- 2026-03-03 -->

### Done

- セッション混線防止のため、`isGenerating/streamBuffer/activeTools` を会話ID単位で管理するように修正。
- `toolCallId` ベースでツール完了判定を行うよう改善し、同名ツールの誤完了リスクを低減。
- Electron メニュー連携向けに New Chat ボタンへ `data-action` を付与。
- Markdownコード判定・コピー処理・Sidebarアクセシビリティの軽微改善を反映。

### Not Done

- なし

## Next Steps

### 確認（今回やったことが効いているか）

- [ ] 複数会話で同時生成し、切替後にストリーム/ツール表示が混線しないことを手動確認する `~3d`

### 新観点（今回は手を付けなかった品質改善）

- [ ] Markdown レンダラーの分割読み込み（dynamic import）を検討し、初回ロードを軽量化する `~30d`

<!-- START:prompt-state:code-review -->

## Prompt Session State: code-review

### Run Meta

- runId: 20260304-030613
- status: success
- startedAt: 2026-03-04T02:54:30+09:00
- endedAt: 2026-03-04T03:06:13+09:00
- nextRunHint: 30m

### Carry Over（次回優先）

- Not Done:
  - なし
- Next Steps:
  - [ ] 会話ごとのモデル切替時に tools:list がアクティブ会話モデル基準で同期されることをE2Eで確認する `~7d`
  - [ ] ツール選択UIに検索入力を追加し、候補数が多い環境で選択時間を短縮する `~30d`

### Todo Queue

- [ ] モデル混在セッションでのツールポリシー保持E2Eを追加する
- [ ] ツール選択UIの検索導線を設計し、A/Bで操作時間を比較する

### Learnings Delta

- ツールカタログ取得は `preferredModel` 固定ではなくアクティブ会話のモデルを優先すると、会話単位のツールポリシー破壊を防げる。
- `availableTools` と `excludedTools` の同時指定はサーバー側で即拒否すると、SDK依存の曖昧挙動を回避できる。
- ストリーミング中の自動スクロールは「最下部付近のみ追従」にすると、履歴読取中の強制ジャンプを防げる。
<!-- END:prompt-state:code-review -->

<!-- START:prompt-state:code-hard-builder -->

## Prompt Session State: code-hard-builder

### Run Meta

- runId: 20260304-012954
- status: success
- startedAt: 2026-03-04T00:50:00+09:00
- endedAt: 2026-03-04T01:29:54+09:00
- nextRunHint: on-demand

### Carry Over（次回優先）

- Not Done: なし
- Next Steps:
  - [ ] コード署名をCI環境で導入（winCodeSign symlink回避）`~30d`

### Learnings Delta

- `signAndEditExecutable: false` 設定下ではelectron-builderがrceditをスキップするため、アイコン/バージョン情報はEXEに埋め込まれない。ポストビルドで `rcedit` を直接実行することで解決可能。
- `winCodeSign-2.6.0.7z` の展開にはdarwin向けsymlinkが含まれ、Windows非管理者環境では「特権不足」で失敗する。`signAndEditExecutable: false` + 手動rceditパターンが回避策。
- `to-ico` パッケージはBuffer配列からマルチサイズICOを生成でき、`sharp` + `to-ico` の組み合わせでSVG→ICO変換が安定動作する。
- monorepoワークスペース構成では electron-builder が hoisted `node_modules` を再帰走査し自己参照パッケージ(ルートworkspace自身)を含めるため asar が数GB級に膨張する。`files` に `!**/node_modules/**/electron/**` 等の除外パターンを追加することで 4.1GB→727MB(−82%)に削減可能。
- NSIS `makensis.exe` は埋め込み7zファイルのメモリマップに ~2GB上限があり、大きすぎると `failed creating mmap` で失敗する。asar pruning後に解消。
<!-- END:prompt-state:code-hard-builder -->
