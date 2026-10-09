# テーマ契約

テーマは、文書（エディター表示とエクスポートHTML）の見た目を決めるCSSです。
ここに書いた契約は `docs/design.md` §8.2 に対応し、`src/core/theme/contract.ts` の
`findThemeContractViolations` で単体テストにより検査されます。

## 1. スコープ

- すべてのルールを `.doc` で始まるセレクタにする（例：`.doc .doc-body h1`）。
- 次のものは書かない：`body` や `html` などの `.doc` の外を指すセレクタ、編集UIのクラス（`.ProseMirror`、`.tableWrapper`、`.selectedCell` など）。
- 使ってよいアットルールは `@media`、`@supports`、`@page` だけ。`@import` と `@font-face` は使わない（エクスポートHTMLは外部を参照しないため）。

## 2. 使ってよいクラス

| 対象               | クラス                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 文書全体           | `.doc`                                                                                                                      |
| ヘッダー／フッター | `.doc-header`, `.doc-footer`, `.doc-logo`, `.doc-copyright`                                                                 |
| 表紙               | `.doc-cover`, `.cover-title`, `.cover-project`, `.cover-version`, `.cover-date`, `.cover-company`, `.cover-client`          |
| 改訂履歴           | `.doc-revisions`                                                                                                            |
| 目次               | `.doc-toc`, `.toc-title`, `.toc-item`, `.toc-level-1`〜`.toc-level-5`, `.toc-number`                                        |
| 本文               | `.doc-body`, `.heading-number`, `.table-figure`, `.table-figure.is-landscape`, `.table-caption`, `.caption-number`, `.xref` |

`h1`〜`h6`、`p`、`ul`、`ol`、`li`、`blockquote`、`pre`、`code`、`table`、`th`、`td`、`img`、`figure`、`figcaption`、`a`、`hr` などの要素セレクタは、`.doc` の下であれば使ってよい。

新しいクラスを出力するときは、先に `docs/design.md` §8.2 と `src/core/theme/contract.ts` に追加する。

## 3. CSS変数

| 変数               | 内容                        | 設定元                                                                                   |
| ------------------ | --------------------------- | ---------------------------------------------------------------------------------------- |
| `--base-font-size` | 本文の基準文字サイズ        | ページ設定（タスク2-9）。未設定時に備えて `var(--base-font-size, 10.5pt)` と既定値を書く |
| `--header-logo`    | ロゴ画像（`url("data:…")`） | テーマ設定値（タスク2-7）                                                                |
| `--copyright`      | Copyright の文字列          | テーマ設定値（タスク2-7）                                                                |

- 文字サイズは `--base-font-size` を `.doc` の `font-size` に使い、ほかは `em` で指定する。
- テーマ内で独自の変数を定義して使うことはできる（例：`.doc { --accent: #2e4a7d; }`）。

## 4. レイアウト

- `.doc` に用紙の幅（`max-width`）・余白（`padding`）・背景色・文字色・書体を指定する。編集画面も同じ `.doc` を使うため、編集画面とエクスポートの体裁が一致する（WYSIWYG）。
- 書体は外部のWebフォントを使わず、OS標準のフォントを指定する（PDFだけはWebフォントで統一する。§10）。
- `.doc, .doc * { box-sizing: border-box; }` を書く（編集画面とエクスポートで、ボックスの計算を揃えるため）。
- 目次（`.doc-toc`）は、エクスポートでは `<main class="doc-body">` の前に、編集画面では `.doc-body` の先頭に置かれる。目次のルールは `.doc .doc-toc …` と書き、`.doc-body` の中かどうかに依存しない指定にする（本文の `a` の色などに負けないよう、項目には色を明示する）。
- 表のセル内の余白に `:last-child` / `:first-child` を使わない。編集中は、列幅変更のハンドルがセルの末尾に要素として追加されるため、`:last-child` の対象が変わってセルの高さが変わる。`td > * { margin: 0 }` と `td > * + * { margin-top: … }` のように、隣接要素で余白を付ける。

## 5. `@page`（PDF用）

- `size` と `margin`（`margin-top` なども含む）は書かない。ページ設定から生成する（§10.1）。
- 余白ボックス（`@top-left` など）と `:first` の指定は書いてよい。

## 6. ビルトインテーマ

| ID         | 名前     | 方針                                       |
| ---------- | -------- | ------------------------------------------ |
| `standard` | 標準     | 明朝の見出し、ゴシックの本文、罫線のある表 |
| `simple`   | シンプル | ゴシックのみ、横罫線だけの表               |

ビルトインは `src/core/theme/builtinThemes.ts` でビルド時に取り込む。
