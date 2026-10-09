# スパイクS-1：PDF組版ライブラリの比較（Vivliostyle / Paged.js）

- 実施日：2026-10-05
- 検証コード：`spikes/pdf/`（本番コードからは参照しない）
- 結論：**Vivliostyle（`@vivliostyle/core`）を採用する**

## 1. 検証方法

| 項目 | 内容 |
|---|---|
| 対象 | `@vivliostyle/core` 2.45.2（AGPL-3.0）／`pagedjs` 0.4.3（MIT、正式版の最新）／`pagedjs` 0.5.0-beta.2（参考） |
| 文書 | `spikes/pdf/build-sample.mjs` が生成する `public/sample.html`。§7.2 の出力構造と §8.2 のテーマ契約に沿い、表紙・改訂履歴・目次・5階層の見出し・図2点・結合セルと入れ子表を含む表・70行の長い表・14列の横向き指定の表・ロゴ（Data URI）・Copyright を含む。テーマは `standard` |
| PDF用CSS | `spikes/pdf/public/print.css`（テーマが書く `@page` の部分と、アプリが加える組版用の基本ルール）。用紙サイズ・余白は `buildPageCss` 相当の文字列を別に注入 |
| 用紙 | A4縦、A3横、カスタム（182×257mm）。横向き指定の表は名前付きページ `landscape` |
| フォント | `@fontsource/noto-sans-jp`（400 / 700） |
| 確認 | Playwright（Chromium、Playwright 1.63）で組版し、ページごとのスクリーンショット・ページ内テキスト・`page.pdf({ preferCSSPageSize: true })` のPDFを出力。PDFは `/MediaBox` で各ページの用紙サイズを、`pdftoppm` で画像化して見た目を確認。アプリへの組み込みを想定し、Vivliostyle は HTML文字列を Blob URL で渡す方式でも確認 |

実行方法：`cd spikes/pdf && pnpm install && pnpm check`（結果は `spikes/pdf/results/`。一覧画像は `node sheet.mjs a4 1,2,3` / `node pdfsheet.mjs vivliostyle-a4`）

## 2. 比較結果

○：期待どおり／△：回避策または調整が必要／×：できない

| 検証項目 | Vivliostyle 2.45.2 | Paged.js 0.4.3 | Paged.js 0.5.0-beta.2 |
|---|---|---|---|
| 目次のページ番号（`target-counter`） | ○ | ○ | ○ |
| 余白ボックス：ロゴ（`content: var(--header-logo)`、Data URI） | ○ | ○ | ○ |
| 余白ボックス：Copyright（`var(--copyright)`、`"` を含む） | ○ | ○ | ○ |
| 余白ボックス：ページ番号（`counter(page) / counter(pages)`） | ○ | ○ | ○ |
| 柱（`string-set: chapter content(text)`） | ○ | ○ | ○ |
| `@page :first` で表紙のヘッダー・フッターを消す | ○ | ○ | ○ |
| 表紙・改訂履歴・目次の後で改ページ | ○ | ○ | ○ |
| 見出しの直後で改ページしない（`break-after: avoid`） | ○ | ×（ページ末尾に見出しだけ残る） | ○ |
| 図の途中で改ページしない | ○ | ○ | ○ |
| 結合セル・入れ子表を含む表 | ○ | ○ | ○ |
| ページを超える長い表の分割 | ○ | ○ | ○ |
| 分割した表で見出し行を繰り返す（`thead`） | ○ | × | × |
| `.table-figure { break-inside: avoid }` と長い表 | △（表全体を次ページに送ってから分割するため、直前のページが空く） | ○（その場で分割） | ○ |
| 日本語組版（Noto Sans JP） | ○（Chromeの組版。両者に差はない） | ○ | ○ |
| `@page` のカスタムサイズ（mm）、A3・横向き | ○ | ○ | ○ |
| 名前付きページ（`page: landscape`）で一部の表だけ横向き | ○ | ×（全ページ縦のまま。横長の表は右が切れる） | × |
| 印刷でのPDF保存：用紙サイズが1種類のとき | ○ | ○ | ○ |
| 印刷でのPDF保存：縦横が混在するとき | △（そのままでは全ページが最大幅×最大高の正方形になる。回避策で解決。§3.2） | −（横向きページが作れない） | − |
| 組版時間（13ページ） | 約1.1〜1.4秒 | 約0.4秒 | 約0.5秒 |
| HTML文字列（Blob URL）からの組版 | ○ | ○（DOMを渡す） | ○ |
| ライセンス | AGPL-3.0 | MIT | MIT |
| 更新状況 | 2026-09 に 2.45.2 | 正式版は 2024-10 の 0.4.3 が最後 | 0.5 は beta.2 で停止 |

## 3. 採用：Vivliostyle

### 3.1 理由

1. **横向きページ（§10.1 の `tableFigure.landscape`）を実現できるのは Vivliostyle だけ**。Paged.js は正式版・beta とも、名前付きページに別の用紙サイズを割り当てられない。
2. 分割した表で**見出し行を繰り返す**。仕様書の長い表では必須。
3. 見出しの直後の改ページ制御（`break-after: avoid`）が正式版で効く。
4. 開発が継続している（Paged.js は正式版の更新が2年近くない）。
5. ライセンス（AGPL-3.0）は、社内利用のみ・配布時はソース公開でもよい、という前提で問題ない（2026-10-05 ユーザー確認）。

組版時間は Paged.js の約3倍だが、13ページで約1秒であり、プレビューの用途では許容範囲。

### 3.2 制約事項と、実装（2-8・2-9）での対応

| 制約 | 対応 |
|---|---|
| **縦横が混在するとPDFが正方形になる**：Vivliostyle は印刷時、全ページの最大幅×最大高を1つの `@page { size }` にする | 組版後に各ページコンテナ（`[data-vivliostyle-page-container]`）の実寸を読み、サイズごとに名前付きページ（`page: viv-size-N` と `@page viv-size-N { size: …pt …pt; margin: … }`）を割り当てる。`margin` は Vivliostyle 自身が出力した `@page` の値を引き継ぐ（高解像度描画のための負の余白。`0` にすると空白ページが大量に増える）。`spikes/pdf/main.js` の `fixVivliostylePrintSizes` を参照。A4（縦12＋横1）とカスタム（縦13＋横1）で、PDFの各ページが正しいサイズになることを確認済み |
| `CoreViewer` は1ページずつ表示する | プレビュー画面のページ送りUIは `navigateToPage` で作る。印刷時は Vivliostyle の印刷用CSSで全ページが出力される |
| 文書はURLで読み込む | `buildExportHtml` の文字列を Blob URL にして `loadDocument` に渡す。PDF用のCSSは `authorStyleSheet` に文字列で渡す（Blob URL からは相対パスの `<link>` を解決できないため） |
| 開発サーバー（Vite）が配信するHTMLにスクリプトを挿入すると、文書内の `<style>` / `<link>` が適用されなかった | アプリでは Blob URL で渡すので該当しない。検証用のサンプルは `public/` から加工なしで配信した |
| `.table-figure { break-inside: avoid }` を付けると、長い表の直前のページが空く | 2-8 で調整する。案：`break-inside: avoid` は小さい表だけに付ける（エクスポート時に行数で判断してクラスを付けるなら §8.2 の契約に追加が必要）か、表には付けず行（`tr`）とキャプションの `break-after: avoid` だけにする |
| 柱の `content(text)` は見出し番号と本文が詰まる（「1はじめに」） | 2-8 で `.heading-number` の後に空白を出力するか、柱用の文字列を別に用意する |
| 組版時間が Paged.js より長い | 大きな文書（100ページ超）での時間は2-8で計測し、必要なら進捗表示を出す |

### 3.3 印刷ダイアログでの確認

自動検証は Playwright の `page.pdf()`（Chromium の印刷処理）で行った。実際のブラウザの「印刷 → PDFに保存」でも、縦横混在の用紙サイズが保たれるかは、2-8 の受け入れ確認で Chrome と Edge の実機で確認する。

## 4. PDF用CSSの方針（2-8 への申し送り）

- テーマが書く部分（§8.2）：余白ボックス（`@top-left` などに `var(--header-logo)`・`string(chapter)`・`var(--copyright)`・`counter(page) " / " counter(pages)`）、`@page :first` で余白ボックスを `content: none`、`h1` の `string-set`。
- アプリが加える部分：`.doc` の幅・余白の解除、Noto Sans JP の指定、`.doc-header` / `.doc-footer` の非表示（PDFは余白ボックスを使う）、表紙・改訂履歴・目次の後の改ページ、見出しの `break-after: avoid`、図と行の `break-inside: avoid`、`thead` の `display: table-header-group`、`.table-figure.is-landscape { page: landscape }`、目次の `target-counter`。
- `--header-logo` / `--copyright` は `:root` に定義する（`@page` の余白ボックスは `.doc` の変数を継承しないため。§7.2 の `<style id="theme-vars">:root{…}` のとおり）。
