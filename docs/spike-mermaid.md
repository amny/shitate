# スパイクS-2：Mermaid図のSVG出力とPDF組版

- 実施日：2026-10-20
- 検証コード：`spikes/mermaid/`（本番コードからは参照しない）
- 結論：**`mermaid` 12.1.0 を `htmlLabels: false` で使い、SVGを正規化してから埋め込む。PDFでは組版後にSVG内の参照を直す回避策が必要**

## 1. 検証方法

| 項目 | 内容 |
|---|---|
| 対象 | `mermaid` 12.1.0（MIT。12.2.0 は公開から2週間たっていないため見送り）、`dompurify` 3.4.17、`@vivliostyle/core` 2.45.2 |
| 図 | `spikes/mermaid/diagrams.js`：フローチャート、シーケンス図、クラス図、状態遷移図、ER図、ガントチャート、円グラフ、マインドマップ（すべて日本語ラベル）と、構文エラーの図 |
| 設定 | `securityLevel: 'strict'`、`theme: 'neutral'`、`fontFamily: '"Noto Sans JP", sans-serif'`（描画前に `document.fonts.load`）、`htmlLabels` は `false` と `true` を比較 |
| 確認 | Playwright（Chromium）で描画し、SVGの要素・サイズ・外部参照を集計した。エクスポートHTMLに似た構造（`.doc > .doc-body > .mermaid-diagram > svg`）を Blob URL で Vivliostyle に渡し、A4縦で組版して、ページごとのスクリーンショットとPDFを出力した |

実行方法：`cd spikes/mermaid && pnpm install && ../../node_modules/.bin/playwright test -c playwright.config.js`（結果は `spikes/mermaid/results/`）。組版後のページ送りや表示の切り替えで参照の修正が保たれるかは `SPEC=refs.spec.js` で確認する。

## 2. 結果

○：期待どおり／△：回避策または調整が必要／×：できない

| 検証項目 | 結果 |
|---|---|
| 8種の図をSVGで描画できる（日本語ラベル） | ○（1図あたり20〜300ms。最初の図は文法の読み込みを含めて約300ms） |
| `htmlLabels: false` で `foreignObject` を含まない | ○（`true` ではフローチャート・クラス図・状態遷移図・ER図・マインドマップのラベルが `foreignObject` になる） |
| DOMPurify（SVGプロファイル）を通しても要素・SVG内の `<style>` が失われない | ○（全図で失われた要素なし） |
| 外部参照（`url(` の外部、`href`、`@import`）を含まない | ○ |
| 構文エラーを検出できる | ○（`render` が行番号つきのエラーを投げる） |
| Vivliostyle で組版できる | ○（`foreignObject` があっても描画はされたが、`false` を採用する） |
| Vivliostyle で矢印（`marker-end`）が表示される | △ 回避策が必要（§3.1） |
| 図の途中で改ページしない（`break-inside: avoid`） | ○（残りの高さに入らない図は次ページに送られる） |
| 横に長い図（ガントチャート）の縮小 | △ 幅に合わせて縮むため文字が小さくなる。仕様とする |
| 読み込むサイズ | ○ 本体（`mermaid.core`）は約85kB（gzip 29kB）。図の種類ごとの文法は必要時に分割読み込みされる（ビルド後のチャンクは合計で約5MB、約90ファイル）。動的 `import()` にすれば通常の編集画面には含まれない |

## 3. 判明した制約と回避策

### 3.1 Vivliostyle がSVG内の `url(#id)` 参照を壊す

Vivliostyle は組版時に、属性の `url(#id)` を自分のID（`url("#viv-id-<文書のURL>:0023<id>")`）に書き換えるが、参照先の `<marker>` の `id` は元のままにする。このため参照が切れ、フローチャートなどの矢印が消える（ブラウザでの表示では問題ない）。

回避策：組版が完了するたび（`readystatechange` が `complete`。既存の `fixPrintPageSizes` と同じ時点）に、ページ内のSVGの属性から `#viv-id-…:0023<id>` を `#<id>` に戻す。スパイクでは24箇所を修正し、矢印が表示された。ページ送り、見開き・倍率の変更、再組版の後も参照は壊れていない（`refs.spec.js`）。

### 3.2 SVGのサイズ

Mermaid は `width="100%"` と `style="max-width: Npx"` を出力する。図の実寸を属性で持たせるため、`viewBox` から `width` / `height` を設定し、`style` を `max-width: 100%; height: auto` にする（用紙幅より大きい図だけ縮小し、テーマCSSに頼らずに済むようにする）。

### 3.3 フォント

`htmlLabels: false` では、Mermaid は描画時のフォントで文字幅を測ってノードの大きさを決める。表示時のフォントが違うと、ラベルがはみ出すことがある。PDFと同じ Noto Sans JP で描画し、SVGの `font-family` も同じにする。エクスポートHTMLはフォントを埋め込まないため、Noto Sans JP の無い環境では代替フォントで表示される（全角文字は幅がほぼ同じで、影響は英数字の幅の差に限られる）。

### 3.4 その他

- Vivliostyle が Mermaid の `<style>` の一部を解析できず、`E_CSS_SYNTAX` / `E_CSS_COLON_EXPECTED` の警告をコンソールに出す。見た目への影響は確認できなかった。
- 図の配色は Mermaid の `neutral` テーマで、テーマ（文書の見た目）とは連動しない。
