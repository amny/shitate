# Shitate

AIで作成したシステム開発ドキュメント（要件定義書・仕様書など）をリッチテキストで編集し、顧客に納品できる単体HTMLとして出力するWebアプリです。

エクスポートしたHTMLには編集用データが埋め込まれており、そのファイルを読み込み直せば編集を再開できます（サーバー保存はしません）。

## 主な機能

- **読込**：Markdown / HTML / TipTap JSON、および本アプリでエクスポートしたHTML
- **編集**：TipTap v3 ベースのリッチテキスト編集。表のセル結合・分割、セル内の箇条書き・画像に対応
- **仕様書向け機能**：見出し採番、目次、図表番号・キャプション、相互参照（番号の変更に自動追従）、表紙、改訂履歴
- **エクスポート**：CSS・画像を埋め込んだ1ファイル完結のHTML
- **PDF出力**：Vivliostyle で組版したプレビューから、ブラウザの印刷機能でページ番号付きPDFを保存
- **テーマ**：ビルトインテーマの選択、ユーザーテーマの作成・編集・インポート／エクスポート。ロゴやCopyrightは設定値としてテーマCSSと分けて管理
- **自動一時保存**：編集中の内容をブラウザ（IndexedDB）に保存し、次回起動時に復元

## 動作環境

- Windows / Mac の Chrome・Edge（Safari は保証外）
- 開発には Node.js と pnpm が必要です

## セットアップ

```bash
pnpm install
pnpm dev
```

## コマンド

| コマンド         | 内容                              |
| ---------------- | --------------------------------- |
| `pnpm dev`       | 開発サーバーを起動                |
| `pnpm build`     | 型チェック＋本番ビルド（`dist/`） |
| `pnpm preview`   | ビルド結果をプレビュー            |
| `pnpm typecheck` | 型チェック                        |
| `pnpm lint`      | ESLint                            |
| `pnpm format`    | Prettier で整形                   |
| `pnpm test`      | 単体テスト（Vitest）              |
| `pnpm test:e2e`  | E2Eテスト（Playwright）           |

## 技術スタック

Vite / React / TypeScript（strict）/ TipTap v3 / Zustand / markdown-it / DOMPurify / zod / idb / Vivliostyle / Vitest / Playwright

## ディレクトリ構成

```
src/
  app/        画面（React）。ツールバー、パネル、PDFプレビュー画面、テーマ編集
  editor/     TipTap の拡張・NodeView・編集UI
  core/       React・DOMに依存しない純粋なロジック（採番計算、インポート、エクスポート、テーマ、PDF用CSS）
  adapters/   ファイル入出力と保存の抽象化（Electron化の際に実装を差し替え）
  pdf/        PDF組版用ページ（pdf-preview.html から読み込み、iframe で表示）
  themes/     ビルトインテーマCSS とテーマ契約（README.md）
fixtures/     テスト用サンプル文書
spikes/       技術検証用コード（本番コードからは参照しない）
tests/e2e/    Playwright テスト
docs/         要件定義書・設計書・タスク一覧
```

## ドキュメント

| ファイル                                     | 内容                                  |
| -------------------------------------------- | ------------------------------------- |
| [docs/requirements.md](docs/requirements.md) | 要件定義書                            |
| [docs/design.md](docs/design.md)             | 設計書                                |
| [docs/tasks.md](docs/tasks.md)               | 実装タスク一覧と受け入れ基準          |
| [docs/spike-pdf.md](docs/spike-pdf.md)       | PDF組版ライブラリの技術検証結果       |
| [src/themes/README.md](src/themes/README.md) | テーマCSSの契約（使えるクラス・変数） |

## ライセンスに関する注意

PDF組版に使用している `@vivliostyle/core` は AGPL-3.0 です。社内利用を前提としており、外部に配布する場合はソース公開が必要になります（`docs/design.md` §2）。

## 今後の予定

- Electron によるデスクトップアプリ化（`docs/tasks.md` 4-1）
