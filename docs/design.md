# 設計書：TipTapリッチテキストエディター

要件は `docs/requirements.md`（要件定義書のMarkdownエクスポート）を参照。本書は実装のための設計を定める。
設計判断を変更する場合は、コードより先に本書を更新すること。

---

## 1. 設計方針

1. **採番・参照・目次の計算は1つの純粋関数に集約する**
   `computeLabels(doc)` が見出し番号・図番号・表番号・参照ラベル・目次項目をすべて計算する。
   エディターの表示（デコレーション／NodeView）とエクスポートの両方がこの結果を使い、表示と出力が食い違わないようにする。
2. **エクスポートHTMLが正本**
   サーバー保存はしない。エクスポートHTMLに編集用JSONを埋め込み、読み込み直せば完全に復元できる。
3. **テーマは「CSS＋設定値」**
   位置・見た目はCSS、ロゴやCopyrightなどの中身は設定値として分け、CSS変数で注入する。
4. **プラットフォーム依存はアダプターに閉じ込める**
   ファイル入出力と保存はインターフェース越しに呼ぶ。Electron化のときはアダプター実装だけを差し替える。
5. **ロジックはReactから切り離す**
   `src/core/` はReactに依存しない純粋なTypeScriptとし、Vitestで単体テストする。

---

## 2. 技術スタック

| 領域 | 採用 | 備考 |
|---|---|---|
| ビルド | Vite | |
| 言語 | TypeScript（strict） | |
| UI | React | |
| 状態管理 | Zustand | 文書メタ・改訂履歴・テーマ選択などアプリ状態 |
| エディター | TipTap v3（`@tiptap/react`、`@tiptap/starter-kit`、Table系、Image） | 導入時に最新版を確認する |
| Markdown変換 | markdown-it（GFM表対応） | Markdown → HTML → TipTap JSON の2段変換にし、TipTapのMarkdown拡張の状況に依存しない |
| HTMLサニタイズ | DOMPurify | 外部HTML読込時 |
| スキーマ検証 | zod | 埋め込みJSONの検証 |
| IndexedDB | idb | |
| ID生成 | nanoid | |
| PDF組版 | Vivliostyle（`@vivliostyle/core`） | S-1で決定（`docs/spike-pdf.md`）。AGPL-3.0（社内利用前提。配布時はソース公開で可） |
| PDF用フォント | `@fontsource/noto-sans-jp` | PDFプレビュー時のみ読み込む |
| テスト | Vitest、Testing Library、Playwright | |
| パッケージ管理 | pnpm | |

---

## 3. ディレクトリ構成

```
src/
  app/                    # 画面（React）
    App.tsx
    layout/               # ツールバー、サイドパネル
    panels/               # 表紙フォーム、改訂履歴、テーマ選択
    pdf/                  # PDFプレビュー画面
    themes/               # テーマ編集画面（3-1）、ユーザーテーマの読み書き
  editor/                 # TipTap関連（Reactに依存してよい）
    createEditor.ts       # 拡張の組み立て
    extensions/
      stableId.ts
      labels.ts           # computeLabelsを保持するプラグイン＋見出し番号デコレーション
      numberedHeading.ts
      figure.ts           # figure / figcaption
      tableFigure.ts      # tableFigure / tableCaption
      tableCell.ts        # セルのcontent制約を上書き
      tableCellGuard.ts   # セル内の見出し・図・表キャプションを除去（§5.2）
      crossRef.ts
      toc.ts
    nodeviews/            # CrossRef、Toc、Figure等のReact NodeView
    ui/                   # 表操作メニュー、参照挿入ダイアログ等
    editor-ui.css         # 編集UI用CSS（テーマとは別）
  core/                   # 純粋TS（Reactに依存しない）
    model/                # 型定義とzodスキーマ
    labels/               # computeLabels
    import/               # markdown / html / json / 自己形式HTML の読込
    export/               # エクスポートHTMLの組み立て
    theme/                # テーマのCSS変数生成、ビルトインテーマ定義、テーマ契約、編集用の操作
    pdf/                  # PDF用CSS（buildPageCss、組版の基本ルール）
  adapters/
    types.ts              # FileAdapter / StorageAdapter
    web/
  themes/                 # ビルトインテーマCSS（*.css）
fixtures/                 # テスト・スパイク用サンプル文書
spikes/                   # 技術検証用（本番コードからimportしない）
tests/
  e2e/                    # Playwright
docs/
```

---

## 4. データモデル

`src/core/model/` に型とzodスキーマを置く。

```ts
// 編集中の文書全体
export interface DocumentState {
  doc: JSONContent;            // TipTap JSON（本文）
  meta: DocMeta;               // 表紙
  revisions: Revision[];       // 改訂履歴
  themeId: string;
  settingsOverride?: Partial<ThemeSettings>; // 文書ごとの上書き（顧客名など）
}

export interface DocMeta {
  title: string;
  projectName: string;
  version: string;             // 版数 例 "1.2"
  date: string;                // ISO "2026-10-01"
  companyName: string;
  clientName?: string;
}

export interface Revision {
  id: string;
  version: string;
  date: string;                // ISO
  description: string;
  author: string;
}

export interface Theme {
  id: string;
  name: string;
  builtIn: boolean;
  baseId?: string;             // ビルトインから複製した場合の元ID
  css: string;
  settings: ThemeSettings;
}

export interface ThemeSettings {
  logoDataUri?: string;        // data:image/png;base64,...
  copyright?: string;          // "© 2026 ○○株式会社"
  tocDepth: 1 | 2 | 3 | 4 | 5; // 目次に載せる深さ（既定3）
  page: PageSettings;          // PDFのページ設定（§10.1）
}

export interface PageSettings {
  size: "A4" | "A3" | "B4" | "custom"; // 既定 "A4"
  orientation: "portrait" | "landscape"; // 既定 "portrait"
  customMm?: { width: number; height: number }; // size が "custom" のとき
  margin: "narrow" | "normal" | "wide";  // 既定 "normal"
  baseFontPt: number;                    // 本文の基準文字サイズ 9〜12（既定 10.5）
}

// エクスポートHTMLに埋め込むJSON
export interface EmbeddedData {
  format: "tiptap-spec-doc";
  version: 1;
  state: DocumentState;
  theme: Theme;                // 使用テーマを丸ごと同梱（手元にないテーマでも復元できる）
}
```

- 形式変更に備え、`version` で分岐するマイグレーション関数 `migrate(data)` を `core/import` に置く。

---

## 5. エディターのスキーマとカスタム拡張

### 5.1 ノード一覧

| ノード | 種別 | content / 属性 | 備考 |
|---|---|---|---|
| heading | block | `inline*` / `level`, `id`, `numbered`(既定true) | StarterKitのHeadingを拡張 |
| paragraph, bulletList, orderedList, blockquote, codeBlock, horizontalRule | block | StarterKit既定 | |
| image | block | `src`, `alt`, `title`, `width`, `height` | block画像で統一する（inlineにしない）。`width` / `height` はリサイズ後の表示サイズ（px、未指定は `null`） |
| figure | block | `image figcaption` / `id` | 本文の図。図番号の対象 |
| figcaption | block | `inline*` | 図のキャプション（画像の下） |
| tableFigure | block | `tableCaption table` / `id`, `landscape`(既定false) | 本文の表。表番号の対象。`landscape` でPDF上は横向きページに配置（§10.1） |
| tableCaption | block | `inline*` | 表のキャプション（表の上） |
| table / tableRow / tableCell / tableHeader | — | Table拡張 | セル結合・列幅変更を有効化 |
| crossRef | inline, atom | `targetId` | 相互参照 |
| toc | atom（`block` グループに入れない） | なし（深さは設定値 `tocDepth`） | 目次。文書の先頭に最大1つ（下記） |

- 文書（`doc`）の content は `toc? block+` とする（2-5で変更）。目次は文書の先頭に最大1つだけ置け、表のセル・リスト・引用の中には構造上置けない。出力順「表紙 → 改訂履歴 → 目次 → 本文」（要件定義）と編集画面の並びが常に一致する。
- ツールバーの「目次」ボタンは、目次が無ければ文書の先頭に挿入し、あれば削除する。
- 画像のリサイズ：Image拡張の `resize`（`ResizableNodeView`）を使う。ハンドルは下の左右の角で、縦横比は常に保つ。ドラッグを終えたときの表示サイズ（px）を `width` / `height` に保存する（用紙幅より大きくはならない）。本文・図・セル内の画像のすべてが対象。エクスポートでは `<img width height>` として出力し、テーマの `img { max-width: 100%; height: auto }` により、用紙の狭いPDFなどでは縦横比を保って縮小される。ハンドルと選択枠は `editor-ui.css` に置く。

### 5.2 表セル内の許容コンテンツ

要件定義で「表の入れ子は許可」「表内の画像は図番号の対象外」と決定済み。

- `tableCell` / `tableHeader` の content を次のグループに制限する：
  `(paragraph | bulletList | orderedList | blockquote | codeBlock | image | table)+`
- セル内には `figure` / `tableFigure` / `heading` / `toc` を置けない。
  → セル内の画像・表はキャプションも番号も持たない。
- リスト項目・引用は任意のブロックを含められるため、content の制限だけでは間接的に見出し等が入り得る。`tableCellGuard`（appendTransaction と貼り付け時の変換）で、セル内の任意の深さにある `heading` を `paragraph` に、`figure` / `tableFigure` を画像・表とキャプション文字列の段落に戻す（2-3）。`toc` は `block` グループに属さず文書の先頭にしか置けないため（§5.1）、ガードの対象にしない。
- 入れ子の表もセル結合・列幅変更の対象とする。

### 5.3 安定ID（`stableId`）

- 対象ノード：`heading`, `figure`, `tableFigure`
- `appendTransaction` で、IDが無いノード・形式が違うID・文書内で重複したID（コピペ由来）を検出し、新しいIDを振る。
- ID形式：`h-xxxxxxxx` / `f-xxxxxxxx` / `t-xxxxxxxx`（nanoid 8文字、英小文字と数字）。形式が違うID（外部HTMLの `id="intro"` など）は振り直す（エクスポートHTMLの要素IDとの衝突を防ぐため）。
- 重複したIDは、編集前の文書でそのIDがあった位置をトランザクションのマッピングで追跡し、追跡先にあるノード（元のノード）のIDを残して、ほかに新しいIDを振る。追跡できない場合は先に出現した方を残す（元の見出しの前に貼り付けても、元のIDが変わらないようにするため）。
- 相互参照が既存IDを指し続けるよう、既存ノードのIDは変更しない。

### 5.4 ラベル計算（`computeLabels`）

`src/core/labels/computeLabels.ts`：TipTap JSON（またはProseMirrorのdoc）を受け取り、次を返す純粋関数。

```ts
export interface Labels {
  headings: Map<string, { number: string; level: number; text: string }>; // "2.1.3"
  figures:  Map<string, { number: number; caption: string }>;             // 図1
  tables:   Map<string, { number: number; caption: string }>;             // 表1
  toc: Array<{ id: string; level: number; number: string; text: string }>;
}
export function computeLabels(doc: JSONContent): Labels;
export function formatRef(labels: Labels, targetId: string): string | null;
// 見出し → "2.1節"、図 → "図3"、表 → "表2"、見つからない → null
```

採番ルール：
- H1〜H5 を `1` / `1.1` / … / `1.1.1.1.1` で採番する。上位レベルが進んだら下位カウンタを0に戻す。
- H6 は採番せず、カウンタにも影響しない。
- `numbered=false` の見出しは採番せず、カウンタも進めない。**その配下の見出し**（次に同じか上位のレベルの見出しが現れるまでの、より下位の見出し）も採番せず、カウンタを進めない。配下を抜けた後の見出しは、採番しない範囲が無かったものとして採番を続ける（例：文書先頭の採番しないH1「はじめに」とその下のH2は採番されず、次のH1は「1」。1.2 の後の採番しないH2の下のH3は採番されず、次のH2は「1.3」）。2-2完了後にユーザー要望で変更。
- レベルが飛んだ場合は、飛ばしたレベルのカウンタが0なら1とみなす（例：H1「1」の直後のH3は「1.1.1」、続くH2は「1.2」。文書先頭のH2は「1.1」）。番号の重複を避けるため。
- 図・表は文書全体の通し番号。
- 目次項目（`toc`）にはすべての見出しを入れる（採番しない見出しは `number: ""`）。表示する深さは表示側で `tocDepth` によって絞る。
- `formatRef`：見出し → 「2.1節」、採番しない見出し → 「「付録」」（題名をかぎ括弧で囲む）、図 → 「図3」、表 → 「表2」、見つからない → `null`。
- 以上は `src/core/labels/computeLabels.test.ts` で固定している。

### 5.5 ラベルの表示（`labels` プラグイン）

- ProseMirrorプラグインのstateに `Labels` を保持し、`docChanged` のときだけ再計算する。
- 見出し番号：見出し先頭に widget デコレーションで `<span class="heading-number">2.1</span>` を表示（本文テキストには含めない）。
- 図・表番号：見出しと同じく widget デコレーションで、キャプションの先頭に `<span class="caption-number">図1</span>` / `表1` を表示する（2-3で NodeView から変更。仕組みを見出しと共通にし、番号が本文に入らないことを保証しやすくするため）。空のキャプションにはプレースホルダーを表示する。
- crossRef：ノードデコレーションで `data-label`（`formatRef` の結果）を付け、編集UIのCSS（`::before { content: attr(data-label) }`）で表示する。`null` のときは `data-label="参照先なし"` とクラス `is-broken` を付けて警告スタイルで表示する（2-4で NodeView から変更。参照ノード自体は変わらないため NodeView は番号の変化で再描画されないが、デコレーションの変化は反映されるため）。
- toc：NodeViewで `labels.toc` を `tocDepth` までの深さで一覧表示する。中身はエクスポートと同じ `renderTocContent`（`core/export/toc.ts`）で作る。`tocDepth` はアプリの状態（文書の上書き ＞ テーマの設定値）から `setTocDepth` コマンドでエディターに渡し、プラグインのstateに持つ。目次の内容（項目と深さ）をノードデコレーションのspecに載せ、内容が変わったときだけ再描画する。項目のクリックで、その見出しへスクロールする。
- 目次に載せる深さは、文書設定パネルの「目次に載せる深さ」で変え、文書ごとの上書き（`settingsOverride.tocDepth`）に保存する。テーマの設定値は変えない（テーマの編集は3-1）。

### 5.6 相互参照の挿入UI

- ツールバーの「参照を挿入」でダイアログを開き、見出し・図・表の一覧（番号＋テキスト）から選ぶ。
- 選択すると `crossRef` ノードを挿入する。
- 一覧は絞り込みの入力欄付き。矢印キーで選び、Enter（`isComposing` を判定）で挿入、Escで閉じる。
- `crossRef` は `<span class="xref" data-target-id>` で表し、エクスポートでは `<a class="xref" href="#id">2.1節</a>`（参照先なしは `<span class="xref">参照先なし</span>`）を出力する。読み込み時は `a.xref[href^="#"]` も `crossRef` として取り込む。

---

## 6. インポート

`src/core/import/index.ts` の `importFile(name, text)` がファイル種別を判定して振り分ける。

| 入力 | 判定 | 処理 |
|---|---|---|
| 自己形式HTML | `<script type="application/json" id="doc-data">` がある | JSONを取り出し → zod検証 → `migrate` → `DocumentState` と `Theme` を復元 |
| 外部HTML | 拡張子 `.html` で上記なし | DOMPurifyでサニタイズ → `generateJSON(html, extensions)` |
| Markdown | 拡張子 `.md` | markdown-it（GFM表）でHTML化 → 外部HTMLと同じ経路 |
| TipTap JSON | 拡張子 `.json` | zod検証（`type: "doc"`） |

- 外部HTML／Markdown／JSONから読んだ場合、`meta` と `revisions` は空で初期化し、テーマは現在の選択を使う。
- `<figure><img><figcaption>` は parseHTML で `figure` に変換する。表のキャプションは、解析の前に `div.table-figure > div.table-caption + table` の形に整えてから `tableFigure` に変換する（対象：`<table><caption>…</caption>…</table>`、`<figure><table>…</table><figcaption>…</figcaption></figure>`）。1つの要素から2つのノードは作れないため。
- エクスポートが差し込んだ番号（`span.heading-number` / `span.caption-number`）は、外部HTMLとしての読み込み時と貼り付け時に取り除く（番号が本文の文字として入らないようにするため）。
- 同様に、エクスポートが `meta` / `revisions` から生成した表紙（`.doc-cover`）と改訂履歴（`.doc-revisions`）、テーマ設定値から生成したヘッダー（`header.doc-header`）・フッター（`footer.doc-footer`）も取り除く（2-6・2-7）。本文に取り込むと、表紙のタイトルが見出しに、改訂履歴が本文の表になってしまうため。
- 自己形式HTMLの埋め込みテーマIDが手元に無い場合は、同梱の `theme` をユーザーテーマとして登録する。

---

## 7. エクスポート

`src/core/export/buildExportHtml(state, theme, options)` が文字列を返す純粋関数。

### 7.1 手順

1. `computeLabels(state.doc)` を計算する。
2. 本文を `generateHTML` でHTMLにする（スキーマの `renderHTML` は番号を出力しない）。
3. 本文HTMLを DOMParser で解析し、`id` をもとに解決済みの値を差し込む（番号用の属性をスキーマに持たせると、エディターのJSONに余分な属性が入り、`renderHTML` の hole の制約で本文を余分な要素で包む必要があるため。2-2で変更）。
   - 見出し：先頭に `<span class="heading-number">2.1</span>`（採番しない見出し・H6には付けない）
   - 図・表：キャプションの先頭に番号（2-3）
   - 相互参照：解決済みの文字列（2-4）
4. 表紙・改訂履歴・目次を `core/export/templates.ts` のテンプレート関数でHTML化する（表紙・改訂履歴は2-6）。テンプレートはエディター上部のプレビュー（§8.1）と共通。目次は、文書の先頭の `toc` ノードを本文から除き、`<main>` の前に `<nav class="doc-toc">` として出力する（`core/export/toc.ts`。2-5）。深さは `settingsOverride.tocDepth` ＞ テーマの `tocDepth`。
5. 全体を組み立てる。埋め込みJSONには番号を含まない元の `state` を入れる。

### 7.2 出力構造

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>{meta.title}</title>
  <style id="theme-vars">:root{ --header-logo:url("data:..."); --copyright:"© 2026 ..."; }</style>
  <style id="theme">{theme.css}</style>
</head>
<body>
  <div class="doc">
    <header class="doc-header">…ロゴ・Copyright…</header>
    <section class="doc-cover">…</section>
    <section class="doc-revisions"><table>…</table></section>
    <nav class="doc-toc">…</nav>
    <main class="doc-body">…本文…</main>
    <footer class="doc-footer">…</footer>
  </div>
  <script type="application/json" id="doc-data">{EmbeddedData}</script>
</body>
</html>
```

- 本文中の見出しには `id` 属性を付け、目次と相互参照は `<a href="#h-xxxx">` にする。
- ヘッダー・フッターの構造（2-7）：`<header class="doc-header"><img class="doc-logo" src="data:…" alt="ロゴ"></header>`（ロゴがあるとき）、`<footer class="doc-footer"><span class="doc-copyright">© 2026 …</span></footer>`（Copyrightが空でないとき）。値が無ければ出力しない。ロゴは上、Copyrightは下（PDFの余白ボックスの配置 §10 と合わせる）。
- `theme-vars` は `buildThemeVars(settings)`（`core/theme/themeVars.ts`）で生成する。`--header-logo: url("…")` と `--copyright: "…"` の文字列は `escapeCssString`（`"`・`\`・改行・制御文字をエスケープ）を通し、さらに `<style>` 全体を `escapeStyleContent` で `</style` から守る。値が無い変数は出力しない。
- ロゴ・Copyrightの値は項目ごとに「文書の上書き（`settingsOverride`）＞ テーマの設定値」で決める（`resolveHeaderFooter`）。Copyrightは上書きを空文字にすれば非表示にできる。ロゴは上書きで「表示しない」を表せない（`logoDataUri` は `data:image/` で始まる必要があるため。埋め込みデータの形式を変えないための制約）。
- 表紙の構造：`<section class="doc-cover" aria-label="表紙">` の中に、`.cover-client`（「〇〇 御中」）、`.cover-project`、`h1.cover-title`、`.cover-version`（「第1.0版」）、`.cover-date`（「2026年10月1日」）、`.cover-company` の順。空の項目は出力しない。タイトル・案件名・会社名・顧客名がすべて空なら表紙を出力しない。
- 改訂履歴の構造：`<section class="doc-revisions" aria-label="改訂履歴"><h2>改訂履歴</h2><table><thead>版・日付・内容・担当</thead><tbody>…</tbody></table></section>`。内容の改行は `<br>`。行が無ければ出力しない。
- 目次の構造：`<nav class="doc-toc" aria-label="目次"><div class="toc-title">目次</div><a class="toc-item toc-level-2" href="#h-xxxx"><span class="toc-number">1.1</span>題名</a>…</nav>`。採番しない見出しには `.toc-number` を出さない。文書に目次ノードが無ければ出力しない。編集画面では本文（`.doc-body`）の中に表示されるため、本文用のルール（`ul` や `p` の余白）が当たらないよう、リストや段落の要素は使わない。
- エクスポートしたHTMLを本文として読み込む（埋め込みデータなし）場合、`nav.doc-toc` は目次ノードになる。
- 埋め込みJSONは `<` を `\u003c` にエスケープし、`</script>` による途中終了を防ぐ。
- CSS変数の文字列値は、`"` と `\` と改行をエスケープする。
- 画像は `src` のData URIのまま出力する（外部参照にしない）。
- 出力はブラウザ表示用（ページ分割なし）。PDF用の組版は §10 で別に行う。
- 画像ビューア（§7.3）のため、`<head>` の最後に `<style id="image-viewer">`、埋め込みJSONの後に `<script>`（インライン）を出力する。

### 7.3 画像ビューア

- エクスポートHTMLで、本文（`.doc-body`）の画像のうち、表示サイズが元のサイズ（`naturalWidth`）より小さいものをクリックすると、画像を元のサイズで重ねて表示する。図の画像ではキャプション（番号を含む）も表示する。ヘッダーのロゴは対象外。
- 対象の画像には、実行時にスクリプトが `cursor: zoom-in` と `tabindex="0"` を付ける（Enter / Space でも開ける）。ウィンドウのリサイズや画像の読み込み完了時に判定し直す。
- 表示は `<dialog>` の `showModal()`。Esc、「閉じる」ボタン、キャプションの文字以外のクリックで閉じる。
- 表示サイズは元のサイズを上限とし、ウィンドウより大きい画像は、余白とキャプションを除いた領域に収まるよう縦横比を保って縮小する（スクリプトで計算し、開いたときとウィンドウのリサイズ時に計算し直す）。
- スクリプトとCSSは文書のデータを含まない定数（`src/core/export/imageViewer.ts`）なので、エスケープの対象になる値はない。外部を参照しない。
- ビューアの要素（`.doc-image-viewer` など）は実行時に `.doc` の外に作る。テーマCSSは `.doc` 以下にスコープされていて影響しないため、テーマ契約（§8.2）には含めない。
- PDF組版（§10）に渡すHTMLには含めない（`buildExportHtml` の `imageViewer: false`）。テーマ編集画面のプレビューは `sandbox` のiframeなのでスクリプトは実行されない。
- 埋め込みデータは変わらないため、`EmbeddedData.version` は変えない。外部HTMLとして読み込んだ場合も、スクリプトは除去され、ダイアログは静的HTMLに無いため本文に入らない。

---

## 8. テーマ

### 8.1 構成

- テーマCSSは `.doc` 以下にスコープする。エディター画面では編集領域を `.doc > .doc-body`（エクスポートと同じ入れ子）にし、同じCSSをそのまま適用する。
- 用紙の幅・余白・書体はテーマの `.doc` が決める。編集画面のCSSは用紙の背景と影だけを持ち、編集画面とエクスポートの体裁を一致させる（WYSIWYG）。
- 編集UIの要素（表の操作メニューなど）は `.doc` の外に配置し、テーマCSSが及ばないようにする。
- 編集画面の用紙は `div.doc > [ヘッダー] + [表紙・改訂履歴のプレビュー] + div > div.doc-body + [フッター]` の構造とする（2-6・2-7）。ヘッダー・フッターはクリックで文書設定の「テーマ」タブを開く。`theme-vars` の `<style>` もエディターに注入する。プレビューはエクスポートと同じテンプレート（§7.1）で描画し、クリックすると文書設定パネルの対応するタブを開く。表紙・改訂履歴は文書設定パネルのフォームで編集し、本文（エディター）には含めない。
- 編集UI（選択枠、列幅変更ハンドル、結合セルの選択表示、参照先なし警告など）は `src/editor/editor-ui.css` に置き、テーマCSSには含めない。
- テーマCSSには画面用ルールに加えて `@page` ルール（PDF用）を含める。
- テーマ設定値は `buildThemeVars(settings)` でCSS変数の `<style>` に変換して注入する（エディター表示とエクスポートで共通）。
- ロゴ・Copyrightの設定UI（文書設定 > テーマ > ヘッダー・フッター、2-7）：「この文書だけ上書きする」がオフのときはテーマの設定値を表示のみ（編集はテーマ編集 3-1 で行う）。オンにするとテーマの値を上書きにコピーして編集でき、値は `settingsOverride.logoDataUri` / `settingsOverride.copyright` に保存する。オフに戻すと上書きの2項目を削除する。

### 8.2 テーマCSSが参照してよいクラスとCSS変数（テーマ契約）

| 対象 | セレクタ／変数 |
|---|---|
| 文書全体 | `.doc` |
| ヘッダー／フッター | `.doc-header`, `.doc-footer`, `.doc-logo`, `.doc-copyright` |
| 表紙 | `.doc-cover`, `.cover-title`, `.cover-project`, `.cover-version`, `.cover-date`, `.cover-company`, `.cover-client` |
| 改訂履歴 | `.doc-revisions` |
| 目次 | `.doc-toc`, `.toc-title`, `.toc-item`, `.toc-level-1`〜`.toc-level-5`, `.toc-number` |
| 本文 | `.doc-body`, `.heading-number`, `figure`, `figcaption`, `.table-figure`, `.table-figure.is-landscape`, `.table-caption`, `.caption-number`, `.xref` |
| CSS変数 | `--header-logo`, `--copyright`, `--base-font-size` |

- テーマCSSの `@page` には `size` と `margin` を書かない（ページ設定から生成する。§10.1）。余白ボックスや `:first` の指定は書いてよい。
- `@import` と `@font-face` は使わない（エクスポートHTMLは外部を参照しないため）。
- 契約への適合は `src/core/theme/contract.ts` の `findThemeContractViolations` で単体テストする。
- 本文の文字サイズは `--base-font-size` を基準に `em` / `rem` 相当で指定する。

この契約を `src/themes/README.md` に記載し、テーマ追加時の指針とする。

### 8.3 ビルトインテーマ

- `standard`（標準：明朝見出し＋ゴシック本文など、仕様書向けの落ち着いた体裁）
- `simple`（シンプル：ゴシックのみ、罫線少なめ）
- ビルトインは `src/themes/*.css` をビルド時に取り込み、`builtIn: true` で登録する。

### 8.4 テーマ操作

- ビルトインを編集すると、`baseId` を持つコピーをユーザーテーマとして作成し、元は変更しない。
- 「初期状態に戻す」は、`baseId` のビルトインCSSで上書きする。
- テーマ編集画面（3-1。`src/app/themes/`、`React.lazy` で必要時に読み込む）：
  - 文書設定 > テーマの「テーマを編集…」で、選択中のテーマを全画面で開く。左に一覧（ビルトイン / ユーザーテーマ）、中央にテーマ名と「CSS / 設定値 / 使えるクラス」のタブ、右にプレビュー（画面 / PDF）。CSSエディターは CodeMirror 6。
  - ビルトインを開くと、編集用のコピー（新しいID `theme-xxxxxxxx`、`baseId` ＝元のID、名前「標準（編集）」、`builtIn: false`）を作って編集する（`core/theme/editing.ts` の `createEditableTheme`）。「保存」で初めてユーザーテーマとして登録し、「キャンセル」では何も残さない。ユーザーテーマと、文書に埋め込まれていた手元に無いテーマは、同じIDのまま編集し、保存でユーザーテーマとして上書き登録する。保存したテーマを文書のテーマにする。
  - 「初期状態に戻す」は `baseId` のあるテーマで使え、編集中のCSSを元のビルトインのCSSにする（保存で確定）。設定値は戻さない。
  - 設定値タブでテーマの設定値（ロゴ、Copyright、目次の深さ、ページ設定）を編集する。文書ごとの上書きは文書設定パネルで行う。
  - 編集中のCSSを `checkThemeContract`（違反を種類と対象で返す。`findThemeContractViolations` はその英語の文字列版）で検査し、`formatViolationForUser` の日本語で一覧表示する。違反があるあいだは保存できない（テーマCSSは編集画面にも適用されるため、`.doc` の外を指すルールはアプリの画面を壊す）。
  - 画面のプレビューは、現在の文書を編集中のテーマで `buildExportHtml` したHTMLを `iframe`（`srcdoc`）で表示する（アプリから隔離するため）。入力が止まってから0.4秒後に更新する。PDFのプレビューは §10 のプレビュー用ページで組版する。
  - 未保存の変更があるときに、別のテーマへの切り替え・「編集に戻る」・「キャンセル」をすると確認する。
- ユーザーテーマは `StorageAdapter` の `themes` ストアにIDをキーとして保存する。起動時に `list` で読み、`themeSchema` で検証して、壊れたデータは読み飛ばして警告を出す。テーマ選択の一覧には、ビルトイン → ユーザーテーマ → 文書に埋め込まれていた手元に無いテーマ の順に並べる。
- ユーザーテーマの追加・複製・削除と、テーマ単体のJSONファイル（`Theme`）のインポート・エクスポートを提供する（3-2。テーマ編集画面の一覧の下のボタン。処理は `core/theme/themeFile.ts`）。
  - 追加は「複製」と「読み込み」で行う。複製はビルトインにも使え、すぐにユーザーテーマとして保存する。名前は「標準のコピー」（重なれば「標準のコピー 2」…）、`baseId` は元のテーマのもの（ビルトインならそのID）を引き継ぐ。
  - テーマファイル：`{ "format": "shitate-theme", "version": 1, "theme": Theme }` のJSON（`テーマ名.theme.json`）。`EmbeddedData` と同じく識別子と版で包み、他のJSONと区別して将来の形式変更に備える。
  - 読み込みは形式・`themeSchema`・テーマ契約を検査し、違反があれば登録しない。同じIDで同じ内容のテーマが手元にあれば「既にある」と知らせ、内容が違えば新しいIDで追加する（手元のテーマは上書きしない）。ビルトインを書き出したファイルはユーザーテーマのコピーとして追加する。手元に無いビルトインを指す `baseId` は外す。
  - 「複製」「書き出し」は保存済みの内容を対象にし、未保存の変更がある間は使えない。
  - 削除はユーザーテーマだけで、必ず確認する。文書で使用中のテーマは、削除しても文書に埋め込まれたテーマとして残り（`documentTheme`）、見た目は変わらない。

---

## 9. 保存とアダプター

### 9.1 インターフェース

```ts
export interface FileAdapter {
  openFile(accept: string[]): Promise<{ name: string; text: string } | null>;
  openImage(accept: string[]): Promise<{ name: string; dataUri: string } | null>; // 画像をData URIで読む
  saveFile(suggestedName: string, content: string, mime: string): Promise<void>;
}

export interface StorageAdapter {
  get<T>(store: "drafts" | "themes" | "settings", key: string): Promise<T | undefined>;
  set(store: "drafts" | "themes" | "settings", key: string, value: unknown): Promise<void>;
  delete(store: "drafts" | "themes" | "settings", key: string): Promise<void>;
  list<T>(store: "drafts" | "themes" | "settings"): Promise<T[]>;
}
```

- `get<T>` / `list<T>` の `T` は呼び出し側の想定にすぎず、保存値は検証されない。読み出した値は呼び出し側でzodスキーマ等により検証する。
- Web版：`openFile` / `openImage` は `<input type="file">`（`openImage` は FileReader でData URI化）、`saveFile` はBlob＋ダウンロードリンク。`StorageAdapter` はidbでIndexedDBに保存する。
- アプリコードはアダプターの具象クラスを直接importせず、`src/adapters/index.ts` の取得関数経由で使う。
- localStorageは使わない（画像入りの文書で容量を超えるため）。

### 9.2 自動保存

- `DocumentState` の変更を1秒debounceして `drafts/current` に保存する。
- 起動時に `drafts/current` があれば、「前回の編集内容を復元しますか？」と確認する。
- 保存に失敗したら画面に警告を出す（黙って失敗しない）。

---

## 10. PDFプレビュー

組版ライブラリは **Vivliostyle（`@vivliostyle/core` の `CoreViewer`）** を使う（S-1。比較結果と制約は `docs/spike-pdf.md`）。

- 「PDFプレビュー」ボタンで専用画面を開き、`buildExportHtml` の結果を Blob URL にして `CoreViewer.loadDocument` で組版・表示する。PDF用のCSS（ページ設定の `buildPageCss` と、組版用の基本ルール `PDF_BASE_CSS`。`src/core/pdf/`）は `authorStyleSheet` に文字列で渡す。
- **組版は別ページ（`pdf-preview.html`、`src/pdf/`）で行い、プレビュー画面に `iframe` で表示する**（2-8）。Vivliostyle は読み込んだ文書自体にページのDOMとスタイルを作るため、アプリと同じ文書では、アプリのCSSが組版結果に影響し、印刷にもアプリの画面が含まれる。`iframe` に分けることで、印刷対象を組版結果だけにし、PDF用フォントもプレビュー時だけ読み込む。親画面は同一オリジンの `iframe` の `window.shitatePdf`（`PdfFrameApi`：`render` / `showPage` / `setView` / `print`）を呼び出す。
- `CoreViewer` は1ページか見開きを表示するため、表示の切り替えは「1ページ / 見開き」（`pageViewMode`）と「全体表示 / 100%」（`fitToScreen` / `zoom`）とし、ページ送りは `navigateToPage` で行う（画面デザインの「見開き3ページ」は Vivliostyle の表示方式に無いため変更。2-8）。
- PDF用にだけ、エクスポートHTMLの本文の見出し番号（`.heading-number`）の直後に空白を1つ入れてから組版する（`src/pdf/prepareHtml.ts`）。柱の `string-set: chapter content(text)` が「1はじめに」と詰まらないようにするため。納品HTMLと編集画面は変えない（番号と題名の間隔が変わり、編集画面とのWYSIWYGが崩れるため。2-8）。
- 表紙のヘッダー・フッターは `@page :first` で消すため、表紙の無い文書では1ページ目（目次や本文）にもヘッダー・フッターが出ない。
- 組版の前に `document.fonts.load` で、文書の文字を含む Noto Sans JP（400 / 700）を読み込む（読み込み前の文字幅で組版しないため）。
- ユーザーはブラウザの印刷機能で「PDFに保存」する（`iframe` の `print()`）。
- **縦横混在ページの印刷**：Vivliostyle は印刷時に全ページを1つの用紙サイズ（最大幅×最大高）で出力するため、組版後に各ページコンテナの実寸からサイズごとの名前付きページ（`@page viv-size-N { size; margin }`）を割り当てる。`margin` は Vivliostyle が出力した `@page` の値を引き継ぐ（`docs/spike-pdf.md` §3.2）。
- PDFプレビュー時のみ Noto Sans JP を読み込み、フォントを統一する（エクスポートHTMLにはフォントを埋め込まない）。
- テーマCSSの `@page` で次を実現する（S-1で動作確認済み）：
  - 余白ボックスにロゴ（`background-image: var(--header-logo)` を `background-size` で縮小。`content: var(--header-logo)` では画像が元のサイズのまま描画され、縮小できないため）・Copyright（`var(--copyright)`）・ページ番号（`counter(page) " / " counter(pages)`）・柱（`string-set` で現在の章タイトル）。変数は `:root` に定義する（余白ボックスは `.doc` の変数を継承しない）
  - 表紙（`@page :first`）ではヘッダー・フッターを出さない
- アプリが加える組版用の基本ルール（テーマに依存しない）：
  - 表紙・改訂履歴・目次の後で改ページ
  - 見出しの直後で改ページしない（`break-after: avoid`）
  - 図・表の行の途中で改ページしない（`break-inside: avoid`。ページを超える大きな表は分割を許容し、`thead` を各ページで繰り返す）。`.table-figure` 全体には `break-inside: avoid` を付けず、キャプションに `break-after: avoid` を付ける（全体に付けると、長い表の直前のページが空になるため。S-1）
  - 目次のページ番号は `target-counter(attr(href url), page)`
  - ブラウザ表示用の `.doc-header` / `.doc-footer` は非表示（PDFは余白ボックスを使う）
  - `.table-figure.is-landscape { page: landscape; }`

### 10.1 ページ設定

紙への印刷は前提としないため、A4に固定しない。画面で読むPDFでは1ページの情報量は「ページ幅に対する文字サイズ」と余白で決まるので、`PageSettings`（§4）として持つ。

- 値の優先順位：文書ごとの上書き（`settingsOverride.page`）＞ テーマの設定値 ＞ 既定値（A4縦・標準余白・10.5pt）。
- `src/core/pdf/pageCss.ts` の `buildPageCss(page: PageSettings): string` が次を生成し（値は `resolvePageSettings` で決める。2-8）、PDFプレビュー時にテーマCSSの後に注入する。`@page` の `size` はCSS変数での指定が不安定なため、変数ではなく値を直接書き込む。
  ```css
  @page { size: 210mm 297mm; margin: 20mm 18mm; }
  @page landscape { size: 297mm 210mm; }
  .doc { --base-font-size: 10.5pt; }
  .doc-body .table-figure.is-landscape { page: landscape; }
  ```
- 余白のプリセット：`narrow` 12mm / `normal` 20mm 18mm / `wide` 25mm（S-1後に調整してよい）。
- サイズはキーワードではなくmmで書き込む（A4 210×297 / A3 297×420 / B4 はJIS B4 257×364）。
- `custom` の場合は `customMm` の幅・高さをmmで書き込む（入力範囲は100〜1000mm）。短い辺を幅とし、向きは `orientation` で決める。
- `--base-font-size` はエディター表示とエクスポートHTMLにも適用し（`buildThemeVars` の `:root` 変数。2-9）、編集画面・納品HTML・PDFで文字の大きさの比率を揃える。
- `landscape: true` の表は、PDF上で名前付きページ `landscape` に配置する。ブラウザ表示では通常どおり表示する。
- ページ設定のUIは、文書設定パネル（テーマタブ）に「ページ」セクションとして置く（サイズ、向き、余白、基準文字サイズ）。変更は文書ごとの上書き（`settingsOverride.page`）に保存し、テーマは変えない。「テーマの設定に戻す」で上書きを削除する。カスタムの幅・高さが範囲外・数値でないときは保存せずエラーを表示する。
- 表の横向き指定は表の操作メニューの「PDFで横向き」で切り替える（`toggleTableLandscape`）。キャプション付きの表（`tableFigure`）だけが対象。横向き指定した表には、編集画面だけ「PDFで横向き」の印を表示する（`editor-ui.css`）。

---

## 11. テスト方針

| 対象 | 種別 | 内容 |
|---|---|---|
| `computeLabels` / `formatRef` | 単体 | 採番（レベル飛び、`numbered=false`、H6）、図表番号、参照解決、参照先なし |
| インポート | 単体 | Markdown（GFM表、ネストしたリスト）、外部HTML、JSON、自己形式HTML |
| エクスポート | 単体 | 出力構造、エスケープ（`</script>`、CSS文字列） |
| **往復（最重要）** | 単体 | `fixtures/` の各文書で「エクスポート → インポート」後の `DocumentState` が元と一致する |
| stableId | 単体 | 重複IDの振り直し、既存IDの維持 |
| 表操作 | E2E | セル結合・分割、セル内への箇条書き・画像の挿入、エクスポート後の `colspan`/`rowspan` |
| 自動保存 | E2E | 再読込後に復元できる |

`fixtures/` には最低限次を用意する：`basic.md`、`complex-table.html`（結合セル・セル内リスト・入れ子表・セル内画像）、`spec-full.json`（採番5階層・図表・相互参照を含む）。

---

## 12. 未決事項

| 項目 | 決定するタスク |
|---|---|
| ~~PDF組版ライブラリ~~ → Vivliostyle に決定 | S-1（済） |
| 見出しレベル飛び時の採番ルールの最終形 | 2-1（テストで固定） |
| Excel・Wordからの表貼り付けの対応範囲 | 未定（Phase 1では標準のparseHTMLに任せる） |
