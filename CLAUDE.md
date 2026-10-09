# CLAUDE.md

## プロジェクト概要

AIで作成したシステム開発ドキュメント（要件定義書・仕様書など）をTipTapで編集し、顧客に納品できる単体HTMLとして出力するWebアプリ。
エクスポートしたHTMLに編集用データを埋め込み、読み込み直せば編集を再開できる（サーバー保存はしない）。
将来はElectronでデスクトップアプリ化する。

## 必読ドキュメント

| ファイル               | 内容                                                |
| ---------------------- | --------------------------------------------------- |
| `docs/requirements.md` | 要件定義書（何を作るか）                            |
| `docs/design.md`       | 設計書（どう作るか）。実装判断はここに従う          |
| `docs/tasks.md`        | タスク一覧と受け入れ基準。作業はここから1つずつ取る |

作業開始時は必ず `docs/tasks.md` で対象タスクと依存を確認し、`docs/design.md` の該当章を読むこと。

## コマンド

```bash
pnpm dev            # 開発サーバー
pnpm typecheck      # 型チェック
pnpm lint
pnpm test           # Vitest
pnpm test:e2e       # Playwright
```

## 作業ルール

- 1回の作業では、`docs/tasks.md` のタスクを1つだけ進める。範囲外の改修はしない（気づいた点はタスクの「メモ」に書く）。
- タスク完了の条件：受け入れ基準を満たし、`pnpm typecheck && pnpm lint && pnpm test` が通ること。
- 完了したら `docs/tasks.md` のチェックを付け、設計から外れた点や申し送りを「メモ」に書く。
- 設計を変える必要がある場合は、実装より先に `docs/design.md` を更新し、変更点を報告する。
- 依存パッケージを追加したら、理由を作業報告に書く。
- ライブラリのAPIは記憶に頼らず、インストールされたバージョンの型定義・ドキュメントで確認する（特にTipTap v3）。
- コミットメッセージ規約はConventional Commitsに則る。

## 実装規約

### アーキテクチャ

- `src/core/` はReactにもDOMの実画面にも依存しない純粋なTypeScriptにする。ロジックはできるだけここに置いてテストする。
- 採番・図表番号・相互参照・目次の計算は `computeLabels` に一元化する。エディター表示とエクスポートで別々に計算しない。
- ファイル入出力と保存は `src/adapters/index.ts` 経由でのみ使う。`window.indexedDB`、`<input type="file">`、ダウンロード処理を直接書かない。
- localStorage / sessionStorage は使わない。

### エディター

- キーボードショートカットは TipTap の `Mod-` 表記で定義する（Ctrl / ⌘ の差を吸収するため）。
- 独自のキー処理では、必ず `event.isComposing`（ProseMirrorでは `view.composing`）を判定し、日本語変換中の入力を処理しない。
- 番号（見出し番号、図番号など）は文書テキストに書き込まない。エディターではデコレーション／NodeViewで表示し、エクスポート時だけ解決済みの値を出力する。
- 見出し・図・表の既存IDは変更しない（相互参照が壊れるため）。

### スタイル

- 文書の見た目はテーマCSS（`src/themes/`）、編集UIの見た目は `src/editor/editor-ui.css` に分ける。
- テーマCSSが使えるクラスとCSS変数は `docs/design.md` §8.2 のテーマ契約に限る。新しいクラスを出力する場合は契約に追記する。

### エクスポート

- 出力HTMLは1ファイルで完結させる（CSS・画像を埋め込み、外部参照しない）。
- 埋め込みJSONとCSS変数の文字列は必ずエスケープする（`docs/design.md` §7.2）。
- エクスポート形式を変える場合は `EmbeddedData.version` を上げ、`migrate` を追加する。

### テスト

- `src/core/` の関数には単体テストを書く。
- エクスポート→インポートの往復テスト（`fixtures/` の全文書）は常に通る状態を保つ。
- UI操作が絡む表編集はPlaywrightでE2Eテストする。

## 対応環境

- 動作保証：Windows / Mac の Chrome・Edge（Safariは保証外）
- UIの文言は日本語
