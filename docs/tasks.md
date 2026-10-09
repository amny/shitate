# 実装タスク一覧

- 1タスク＝Claude Codeの1セッションで完了できる粒度にしている。
- 上から順に進める。「依存」のタスクが完了していないものには着手しない。
- 完了したら `[ ]` を `[x]` にし、「メモ」に設計から外れた点や申し送りを書く。
- 設計の参照先は `docs/design.md` の章番号（§）。

---

## Phase 0：基盤

### [x] 0-1 プロジェクト初期化
- 内容：Vite＋React＋TypeScript（strict）で初期化。ESLint、Prettier、Vitest、Playwrightを導入。§3のディレクトリを作成。
- パッケージマネージャーはpnpm。scripts：`dev` / `build` / `typecheck` / `lint` / `test` / `test:e2e`
- 受け入れ基準：
  - `pnpm dev` で空の画面が表示される
  - `pnpm typecheck && pnpm lint && pnpm test` が通る（サンプルテスト1件）
- 依存：なし
- メモ：
  - バージョン：Vite 8 / React 19 / TypeScript 6.0 / ESLint 10（flat config）/ Vitest 5 / Playwright 1.63。create-viteの既定はoxlintだったが、計画どおりESLint（typescript-eslint `strictTypeChecked`）にした。
  - tsconfigは `strict` に加えて `noUncheckedIndexedAccess`・`exactOptionalPropertyTypes` を有効にした。
  - ESLintで次の2つを強制している：`src/core` からの React import 禁止、`src/app`・`src/editor`・`src/core` からの `adapters/web` 直接import禁止（0-3の受け入れ基準を機械的に守るため）。
  - サンプルテストは `src/app/App.test.tsx`（Vitest＋Testing Library）と `tests/e2e/smoke.spec.ts`（Playwright）。Vitestの対象は `src/**/*.test.{ts,tsx}`。
  - アプリ外枠のCSSは `src/app/app.css` に置いた（§3に記載なし。テーマCSS・`editor-ui.css` とは別）。
  - 外部フォント（画面デザインの BIZ UDPGothic など）は読み込んでいない。Electron化でオフライン動作させるため、同梱するかは別途決める。

### [x] 0-2 データモデルとzodスキーマ
- 内容：§4の型とzodスキーマを `src/core/model/` に実装。`migrate(data)` の雛形（version 1のみ）。
- 受け入れ基準：正常・異常な `EmbeddedData` の検証テストが通る
- 依存：0-1
- メモ：
  - 型はzodスキーマから `z.infer` で導出している（`src/core/model/types.ts`）。スキーマと型を二重に定義しない。
  - 本文の型は、§4の `JSONContent` ではなく、同じ構造の独自型 `DocNode` / `DocRoot` にした。`JSONContent` は `any` を含み、`src/core` をTipTapに依存させたくないため。未知のキー・属性は往復で失わないよう保持する（looseObject）。エディターとの受け渡し（1-1以降）では、`JSONContent` との変換か型アサーションが1か所必要になる。
  - `migrate` は §4 に従って `src/core/import/migrate.ts` に置いた（タスク本文の「`src/core/model/`」とは異なる）。戻り値は例外ではなく `{ ok, data } | { ok, error }`。`error` はパス付きの日本語メッセージ（zodの `ja` ロケール）で、画面にそのまま表示できる。
  - 検証する範囲：`tocDepth` 1〜5、`baseFontPt` 9〜12、`customMm` 100〜1000mm、`size: "custom"` のときは `customMm` が必須、日付はISO（YYYY-MM-DD）、`logoDataUri` は `data:image/` で始まること。
  - `settingsOverride` は `ThemeSettings` を partial にしたもの（`page` は指定する場合は全項目が必要）。§10.1の値の合成は2-9で行う。
  - 既定のページ設定 `DEFAULT_PAGE_SETTINGS` を `src/core/model/defaults.ts` に置いた。
  - テスト用の正常データは `src/core/model/testData.ts` の `createValidEmbeddedData()`。
  - ESLintの `no-unused-vars` に `ignoreRestSiblings` を設定した（rest構文でキーを除く書き方のため）。

### [x] 0-3 アダプター層
- 内容：§9.1のインターフェースとWeb実装（ファイル入出力、idbによるIndexedDB）。`src/adapters/index.ts` に取得関数。
- 受け入れ基準：
  - `StorageAdapter` の単体テスト（fake-indexeddbを使用）が通る
  - アプリコードから具象クラスを直接importしていない
- 依存：0-1
- メモ：
  - design.md §9.1 を更新した：`set<T>(..., value: T)` を `set(..., value: unknown)` に変更（型引数が1か所でしか使われず、typescript-eslintの `no-unnecessary-type-parameters` に該当するため。受け付ける値は同じ）。あわせて「`get<T>` / `list<T>` で読み出した値は呼び出し側で検証する」と追記した。
  - IndexedDB：DB名 `shitate`、バージョン1、ストアは `drafts` / `themes` / `settings`（キーは引数で渡す方式）。別タブがDBの更新を要求したら接続を閉じ、次の操作で開き直す。
  - 失敗時は `Failed to set drafts/current in IndexedDB "shitate"` のように操作・ストア・キーを含むErrorを投げる（元のエラーは `cause`）。1-5で保存失敗を警告するときに使う。
  - `openFile` は、ダイアログを閉じると `<input>` の `cancel` イベント（Chrome / Edge 113以降）で `null` を返す。
  - `saveFile` は、Blob URLを10秒後に解放する（ダウンロード開始前に解放しないため）。
  - 取得関数は `getFileAdapter()` / `getStorageAdapter()`（最初に呼ばれたときに1つ作って使い回す）。具象クラスの直接import禁止は、0-1で入れたESLintルールで `src/app`・`src/editor`・`src/core` に強制している。
  - 確認はjsdomとfake-indexeddbでの単体テストのみで、実ブラウザでは動作確認していない（1-3・1-5のUI実装時に確認する）。

### [x] 0-4 テスト用フィクスチャ
- 内容：§11の `fixtures/basic.md`、`fixtures/complex-table.html`、`fixtures/spec-full.json` を作成。`spec-full.json` は2-1以降の拡張が揃った時点で更新する。
- 受け入れ基準：各ファイルが存在し、`complex-table.html` に結合セル・セル内リスト・入れ子表・セル内画像が含まれる
- 依存：0-1
- メモ：
  - 受け入れ基準の確認は `src/test/fixtures.test.ts` で行う（`?raw` で読み込み、HTMLはDOMParserで解析し、JSONは `docRootSchema` で検証する）。
  - 画像はすべて小さなPNGのData URI（外部参照なし）。
  - `complex-table.html` のセル内画像は、セル直下のブロック画像にした。`<li>` 内のインライン画像は、§5.1の「画像はblockで統一」と1-3の挙動がぶつかるため入れていない。
  - **`spec-full.json` はPhase 1のノードのみ**（H1〜H6、結合セル・セル内リスト・セル内画像・入れ子表を含む表、画像、リスト、コード、引用、各マーク）。次の項目は拡張ができた時点で追記する：2-1で見出しの `id` / `numbered`、2-3で `figure` / `tableFigure`、2-4で `crossRef`、2-5で `toc`。
  - ノードの属性は、TipTap標準の名前（`colspan` / `rowspan` / `colwidth`、`orderedList.start`、`codeBlock.language`、`image.title`）を想定して書いた。1-1・1-2でインストールしたバージョンの既定属性と異なっていれば合わせる。
  - `fixtures` を `.prettierignore` に追加した（整形で中身が変わらないようにするため）。

---

## Phase 1：編集と出力の核

### [x] 1-1 エディターの基本構成
- 内容：`createEditor.ts` でStarterKit＋Image（block）を組み立て、ツールバー（見出し、太字・斜体・下線・取消線、リスト、引用、コード、リンク、画像挿入、水平線、Undo/Redo）を実装。編集領域のルートに `.doc .doc-body` を付与。
- ルール：ショートカットは `Mod-` 表記。独自キー処理では `isComposing` を判定する。
- 受け入れ基準：
  - 各書式がボタンとショートカットで適用できる
  - 日本語入力の変換確定Enterで改行・段落分割が起きない
- 依存：0-1
- メモ：
  - TipTap 3.31.4。v3のStarterKitにLink・Underline・Undo/Redoが含まれるため、個別には追加していない。`@tiptap/core` の型・APIは `@tiptap/react` から再exportされたものを使う（1-4で `src/core` から `generateHTML` を使う時点で `@tiptap/core` を直接追加する）。
  - design.md §9.1 を更新した：`FileAdapter.openImage(accept)` を追加（画像をData URIで読むため。`openFile` はテキストしか返せない）。
  - 編集領域の構造は `div.doc > div.doc-body[contenteditable]`（エクスポートの `.doc > main.doc-body` と同じ入れ子）。テーマCSSの `.doc .doc-body …` がどちらにも当たる。
  - ショートカットはStarterKitの既定（`Mod-b` / `Mod-i` / `Mod-u` / `Mod-Shift-s` / `Mod-e` / `Mod-Alt-0〜6` / `Mod-Shift-7・8` / `Mod-Shift-b` / `Mod-Alt-c` / `Mod-z` / `Mod-Shift-z`）。独自に追加したのはリンクの `Mod-k` だけ。
  - 独自のキー処理は2か所：`Mod-k`（`view.composing` を判定）、リンク入力欄のEnter/Escape（`isComposing` を判定）。`Mod-k` はトランザクションのメタ情報（`REQUEST_LINK_META`）を出し、UIは `useLinkRequest` で購読する（React Compilerのlintが、render中のrefへの書き込みを禁止するため）。
  - リンクは http(s)・mailto・`#` だけを許可し、クリックで移動しない（`openOnClick: false`）。選択範囲が空のときは、URL自体をリンク文字列として挿入する。
  - 画像は `inline: false`・`allowBase64: true`。altにはファイル名（拡張子を除く）を入れる。読み込み失敗は画面上部のエラー表示（`role="alert"`）に出す。
  - IMEの受け入れ基準はE2Eで確認している：CDPの `Input.imeSetComposition` で変換中の状態を作り、`isComposing: true`・`keyCode: 229` のEnterを送っても段落とリスト項目が増えないこと。対照として、変換中でない同じ合成Enterでは分割されることも確認済み。実際のIMEとは完全には同じでないため、Windows（MS-IME）とMac（日本語入力）での手動確認を推奨する。
  - E2Eの `page.evaluate` でDOMの型を使うため、`tsconfig.node.json` のlibにDOMを追加した。
  - プレビュー用に `.claude/launch.json`（`pnpm dev --port 5174`）を追加した。
  - 範囲外のため未実装：画像の貼り付け・ドロップでの挿入。画面デザインにある表・キャプション・参照・目次のボタン、アウトラインのパネル、ヘッダーの「開く」「エクスポート」は、それぞれのタスクで実装する。

### [x] 1-2 表の編集（セル結合・列幅・セル内コンテンツ）
- 内容：Table系拡張を導入し、`tableCell` / `tableHeader` のcontentを§5.2のとおり制限。行列の追加・削除、セル結合・分割、列幅変更、ヘッダー行の切替のUI（表選択時のメニュー）。
- 受け入れ基準：
  - セル結合・分割ができ、Undoで戻せる
  - セル内に箇条書き・番号付きリスト・画像・表を挿入できる
  - セル内に見出しは挿入できない
  - E2E：結合したセルが `getHTML()` で `colspan`/`rowspan` になる
- 依存：1-1
- メモ：
  - **design.md §5.2 を更新**：ユーザーとの合意により、セル内に `blockquote` / `codeBlock` も許可した（`(paragraph | bulletList | orderedList | blockquote | codeBlock | image | table)+`）。あわせて、セル内の任意の深さにある見出しを段落にする `tableHeadingGuard` を§3・§5.2に追記した。
  - `tableHeadingGuard` は次の3段構え：
    1. `transformPastedHTML`：セルへ貼り付けるとき、解析前に `<h1>`〜`<h6>` を `<p>` に置き換える（ProseMirrorは貼り付け先を基準に解析するため、そのままだと見出しを入れられる引用で包んでしまう）。
    2. `transformPasted`：解析後のスライスに残った見出しを段落にする。
    3. `appendTransaction`：編集の結果セル内に残った見出しを段落にする（リスト項目・引用の中や、入れ子の表も対象）。
  - エディター作成時の初期 `content` には `appendTransaction` が走らない。1-3以降で文書を読み込むときは、`setContent` などトランザクション経由で入れること。
  - 表の操作メニューは `@tiptap/react/menus` の BubbleMenu で、表の右上に表示する（入れ子の表では内側の表に付く）。開発サーバーでReactが二重に読み込まれるのを防ぐため、`vite.config.ts` の `optimizeDeps.include` に `@tiptap/react/menus` を追加した。
  - E2Eから `getHTML()` を呼ぶため、開発ビルドのときだけエディターを `window.__shitateEditor` に公開する（`src/editor/devHook.ts`）。
  - 列幅はドラッグで変更でき、`colwidth` 属性に保存される（手動で確認）。新しい表の列は最小幅（25px）で作られて狭いので、表の幅は1-6のテーマで決める。
  - 既知の挙動：中身が空で縦に結合したセルの空白部分をクリックすると、カーソルが隣のセルに入ることがある（Chromeのキャレット位置の決め方による）。セル内の文字をクリックすれば問題ない。E2Eでは段落をクリックしている。
  - E2E上の注意：ProseMirrorは500ms以内の編集を1回のUndoにまとめる。また、クリックによる選択は `selectionchange` で非同期に反映される（合成した貼り付けの前に `waitForSelectionSync` で待つ）。

### [x] 1-3 インポート（Markdown／外部HTML／JSON）
- 内容：§6のうち自己形式HTML以外。ファイルを開くUI（アダプター経由）。
- 受け入れ基準：
  - `fixtures/basic.md`（GFM表、ネストしたリスト）を読み込める
  - `fixtures/complex-table.html` の結合セルとセル内コンテンツが保持される
  - 外部HTMLの `<script>` 等がサニタイズで除去される
- 依存：1-2、0-4
- メモ：
  - 依存の追加：`markdown-it`・`@types/markdown-it`（Markdown→HTML）、`dompurify`（サニタイズ）、`@tiptap/core`（`src/core` から `generateJSON` / `getSchema` を使うため。Reactに依存しない）。
  - `importFile({ name, text }, { extensions })` は `src/core/import/index.ts`。`src/core` は `src/editor` をimportせず、拡張一式を引数で受け取る。呼び出し側は `createExtensions()` の結果を渡すこと（`editor.extensionManager.extensions` はStarterKitを展開済みのため、スキーマを作り直すと拡張が重複する）。
  - `createExtensions` と `tableHeadingGuard` のimportを `@tiptap/react` から `@tiptap/core` に変えた（Reactに依存させず、`src/core` から使えるようにするため）。
  - `src/core/import` は `DOMParser`（`generateJSON`）とDOMPurifyのためにDOM APIを使う。画面には依存しない。テストはjsdom。
  - サニタイズ：DOMPurifyの既定の処理に加え、`style`・`form`・入力要素・`iframe`・`object`・`embed` のタグと `style` 属性を除去する。画像のData URIは残す。Markdownは `html: true` でHTML化したあと、外部HTMLと同じサニタイズを通す。
  - JSONは、`docRootSchema` に加えてTipTapのスキーマでも検証する（`nodeFromJSON` と `check()`）。未知のノード（2-3以前の `figure` など）や、セル直下の見出しはエラーにする。
  - 外部URLの画像（Data URIでない `src`）は、そのまま読み込み、「外部参照の画像がN件」と警告する（ユーザーと合意済み）。
  - 「開く」はヘッダーに置いた。本文が空でなければ、ブラウザ標準の `confirm` で確認する。読み込みは `setContent` の前に `closeHistory` を入れて独立したUndoにした（直前の入力とまとめて取り消されないようにするため）。通知（エラー・警告）の表示を `Notice` に一般化した。
  - Markdownの表の寄せ（`text-align`）は保持しない（スキーマに属性が無いため）。
  - 自己形式HTMLは、1-4で判定を追加するまでは外部HTMLとして本文だけを読み込む。`meta` / `revisions` / テーマの初期化は、状態を持つ仕組みができる1-4・2-6で行う。

### [x] 1-4 エクスポートHTML（最小版）と自己形式の再読込
- 内容：§7の `buildExportHtml` を、本文＋テーマCSS＋埋め込みJSONの範囲で実装（表紙・改訂履歴・目次・ヘッダー/フッターはPhase 2）。§6の自己形式HTML読込。
- 受け入れ基準：
  - **往復テスト**：`fixtures/` の各文書をエクスポート→インポートして `DocumentState` が一致する
  - `</script>` を含む本文でも埋め込みJSONが壊れない
  - 出力HTMLを単体でブラウザで開くとスタイルが適用され、埋め込みJSONは見えない
- 依存：1-3、0-2
- メモ：
  - 依存の追加：`zustand`（§2で採用済み。本文以外の文書状態 `meta` / `revisions` / `themeId` / `settingsOverride` / 使用中のテーマを `src/app/store/documentStore.ts` に持つ。本文の正本はエディター）。
  - `buildExportHtml(state, theme, { extensions })` は `src/core/export/`。§7の「純粋関数」だが、`generateHTML` が `document` を使うため、1-3と同じくDOM APIに依存する。
  - 出力は §7.2 のうち `<title>`・`style#theme`・`.doc > main.doc-body`・`script#doc-data` のみ。`theme-vars`・表紙・改訂履歴・目次・ヘッダー/フッター・番号はPhase 2。`<meta name="viewport">` を追加した。
  - エスケープ：埋め込みJSONは `<` をすべて `\u003c` にする（`</script>` と `<!--` の両方を防ぐ）。`<title>` はHTMLエスケープ。テーマCSSは `</style` を `<\/style` にする（Phase 3でユーザーがCSSを編集するため）。
  - 自己形式の判定は `.html` / `.htm` の中に `script#doc-data[type="application/json"]` があるかで行う。ある場合は本文の表示部分を使わず、埋め込みデータだけから復元する。埋め込みデータが壊れている・未知のバージョン・内容が不正のいずれかのときは、本文だけ読み込むことはせずエラーにする（欠落に気づけるようにするため）。埋め込みの本文も、TipTapのスキーマで検証する（正規化はしない。往復で完全に一致させるため）。
  - `ImportResult` に `kind: 'document' | 'embedded'` を追加した。
  - **仮のビルトインテーマ**：受け入れ基準の確認のため、`src/themes/standard.css`（最小限の体裁）と `src/core/theme/builtinThemes.ts` を作った。仕上げ、`simple`、テーマの選択UI、編集画面への適用、README は1-6で行う。
  - 同梱テーマは「使用中のテーマ」としてストアに保持するだけで、ユーザーテーマとしての登録（§6）はテーマ管理ができるPhase 3で行う。
  - Markdown / HTML / JSONを開くと、`meta` は空（日付は今日）、`revisions` は空、`settingsOverride` はなしに戻す。テーマはそのまま。
  - 読込のUndoで戻るのは本文だけで、ストアの表紙情報等は戻らない。
  - 出力ファイル名：開いたファイル名（拡張子を除く）→ タイトル → 「文書」の順。Windows / macOS で使えない文字は `_` にする（`toExportFileName`）。
  - E2E：エクスポート→再読込で本文が一致すること、ネットワークを遮断した別ページで出力HTMLを表示するとテーマが当たり、埋め込みJSONが見えないことを確認している。

### [x] 1-5 自動保存と復元
- 内容：§9.2。
- 受け入れ基準：
  - 編集後にブラウザを再読込すると復元確認が出て、復元できる
  - 画像を含む文書（数MB）でも保存できる
  - 保存失敗時に警告が出る
- 依存：1-4、0-3
- メモ：
  - 依存の追加はなし。
  - 下書きは `drafts/current` に `{ savedAt, fileName, data: EmbeddedData }` で保存する（エクスポートの埋め込みデータと同じ形）。読み出し時は `parseDraft` で、外枠の形式・`migrate`・TipTapのスキーマを検証する（`src/core/draft/draft.ts`）。壊れた下書きは復元せず警告し、次の保存で上書きされる。
  - 保存の予約は `createAutosaver`（`src/core/draft/autosaver.ts`）。最後の変更から1秒後に保存し、同時に2回保存しない。保存中の変更は保存後に保存し直す。失敗したら自分では再試行せず、次の変更か `flush` で再試行する。
  - 保存のきっかけは、エディターの `update` と、Zustandのストアの変更。ページを閉じる直前（`pagehide`）に `flush` を試みる（IndexedDBは非同期のため、完了は保証されない）。
  - **起動時の復元確認は画面内のバナー**（`confirm` は使わない）。ユーザーが答えるまでは自動保存を一時停止する（起動直後の空の文書で下書きを上書きしないため）。「破棄する」で下書きを削除する。下書きはエクスポートしても消さない。
  - 保存に失敗すると、ヘッダーに「自動保存に失敗しました」を表示し、画面上部に警告を出す（失敗が続いても警告は1回。容量不足 `QuotaExceededError` は理由を日本語で表示する）。成功すれば「自動保存済み HH:MM」に戻る。
  - 開いているファイル名を、`useOpenDocument` の中からストア（`fileName`）に移した（下書きと一緒に保存・復元するため）。文書状態を集める処理は `src/app/documentState.ts` に分け、エクスポートと共用している。`createEmbeddedData` を `src/core/export` からexportした。
  - E2E：再読込→復元、ファイル名の復元、答える前に上書きしないこと、破棄、約3MBの画像（Data URIで約4MB）の保存・復元、`IDBObjectStore.put` を失敗させたときの警告表示を確認している。
  - 1-4のE2Eに、読み込み完了を待たずに本文を取得していたタイミングの問題があったので直した（`export.spec.ts`）。
  - **保存できるサイズ（2026-10-04 計測、Chrome 152 / macOS）**：
    - このPCでのオリジンの割り当て容量（`navigator.storage.estimate().quota`）は約33GB。1回の書き込みで200MBの値まで制限に当たらなかった。容量超過時は1-5の警告（`QuotaExceededError`）が出る。
    - IndexedDBへの1回の書き込み時間（画像1枚分の文字列で計測。エディターからのJSON取得や検証の時間は含まない）：10MB 約30ms／50MB 約100ms／100MB 約170ms／200MB 約420ms。自動保存は変更が止まるたびに文書全体を書き込み、その間メインスレッドが止まる。
    - 目安：〜50MB（Base64化前の画像で合計約35MB）は気にならない。100MB以上は保存のたびに0.2秒以上の引っかかりが出る。実際には、自動保存よりもエディターでの表示や、エクスポートHTMLの表示が先に重くなる可能性が高い。
    - `navigator.storage.persisted()` は `false`。ディスクが逼迫すると、ブラウザが下書きを削除し得る（正本はエクスポートHTMLなので、設計上は許容）。
    - 検討事項（未計画）：画像挿入時の縮小・圧縮、下書きで画像を本文と分けて保存し差分だけ書き込む方式、`navigator.storage.persist()` の要求。

### [x] 1-6 ビルトインテーマ（2種）とテーマ選択
- 内容：`src/themes/standard.css`、`simple.css` を§8.2の契約に沿って作成。テーマ選択UI。エディター表示とエクスポートに同じCSSを適用。`src/themes/README.md` にテーマ契約を記載。
- 受け入れ基準：
  - テーマを切り替えると編集画面とエクスポート結果の両方に反映される
  - 編集UI用CSS（`editor-ui.css`）がテーマ切替の影響を受けない
- 依存：1-4
- メモ：
  - 依存の追加はなし。
  - **design.md §8.1・§8.2 を追記した**：
    - 編集領域は `.doc > .doc-body`。
    - 用紙の幅・余白・書体はテーマの `.doc` が決める（WYSIWYG。`app.css` の `.editor-paper` は背景と影だけ）。
    - 編集UIの要素は `.doc` の外に置く。
    - `@import` / `@font-face` は禁止。
    - 契約への適合は単体テストで検査する。
  - テーマ契約の一覧と検査関数は `src/core/theme/contract.ts`（`findThemeContractViolations`）。検査内容：`.doc` 下へのスコープ、契約外のクラス、`@page` の `size` / `margin`、許可していないアットルール、契約外のCSS変数。ビルトイン2種が契約に適合することを単体テストで確認している。
  - **Vitestが `?raw` で読み込んだCSSを空にしていた**（既定でCSSを処理しないため）。1-4のエクスポートのテストも、空のテーマCSSで通っていた。`vite.config.ts` の `test.css.include` に `src/themes/*.css` を追加して修正した。
  - テーマCSSに書いたのは、本文と、本文に出る契約クラス（`.heading-number`、`figure`、`.table-caption`、`.caption-number`、`.xref`）まで。表紙・改訂履歴・目次・ヘッダー/フッターのCSSは、出力構造が決まる2-5〜2-7で追記する。`@page` は2-8で追記する。
  - 書体はOS標準（本文：Hiragino Kaku Gothic ProN / BIZ UDPGothic / Meiryo、標準テーマの見出し：Hiragino Mincho ProN / BIZ UDPMincho / Yu Mincho）。
  - テーマ選択UIは、右側の「文書設定」パネル（画面デザインどおり）。今回は「テーマ」セクションだけで、表紙・改訂履歴のタブは2-6で追加する。テーマの説明文はUI用の `BUILTIN_THEME_DESCRIPTIONS` に持つ（`Theme` のデータには含めない）。
  - 開いたファイルに含まれていたテーマが現在のビルトインと異なる場合（IDかCSSが違う）、「この文書に含まれていたテーマ」として選択肢に残す（`documentTheme`）。自動保存の下書きには使用中のテーマだけを保存するため、ビルトインに切り替えた状態で復元すると、この選択肢は消える。
  - **表の操作メニューがテーマの影響を受けていた**：BubbleMenuは既定で要素をエディターの親（＝ `.doc`）に追加するため、テーマの文字色などが及んでいた。`appendTo` で `.app-main` に置くよう修正した（`.app-main` を `position: relative` にし、スクロール領域内で配置・クリップされる）。
  - 表の操作メニューを1行に収めた（行／列ごとにまとめ、表示は「上に追加」など短く、`aria-label` と `title` は「行を上に追加」などの完全な名前）。表が文書の先頭にあって上に余白がないときは、表の下に表示されるため、表の直後の段落に重なる（よくある浮動メニューの挙動として許容）。
  - 編集用のセルの破線ガイドは、テーマの罫線と重なるため、表にポインタを乗せたときだけ表示するようにした。
  - 編集画面の表は、列幅変更のために `table-layout: fixed`（`editor-ui.css`）。エクスポートは各テーマの指定（現状 auto）なので、列幅を指定していない表では、編集画面と出力で列幅の決まり方が異なる。気になる場合は、テーマにも `table-layout: fixed` を入れるか検討する（S-1・2-8で確認）。
  - E2E：テーマ切替で編集画面とエクスポートが変わること、テーマを切り替えても編集UI（ヘッダー、ボタン、段落の種類の選択、表の操作メニュー、リンク入力、設定パネル）の計算済みスタイルが変わらないこと、自動保存からテーマを復元すること、同梱テーマを選択肢に残すことを確認している。
  - 既存E2Eのタイミングの問題を2件直した：`open.spec.ts`（ダイアログを明示的に待つ）、`table.spec.ts`（表の直後へのカーソル移動をAPIで行う）。
  - **不具合修正（1-6完了後）**：縦罫線にポインタを乗せると、セルの高さが変わっていた。prosemirror-tables が列幅変更ハンドル（`div.column-resize-handle`）をセルの末尾の子要素として追加するため、テーマの `td > :last-child { margin-bottom: 0 }` が段落に当たらなくなり、段落の下余白が戻っていた（実測 32px → 44px）。テーマ2種のセル内余白を `td > * { margin: 0 }` と `td > * + * { margin-top: 0.5em }` に変更し、ハンドルには `editor-ui.css` で `margin: 0` を指定した。`src/themes/README.md` に「セル内の余白に `:last-child` / `:first-child` を使わない」と追記した。E2E（両テーマ）で回帰を確認している。

**Phase 1 完了条件：納品用HTMLをエクスポートし、読み込み直して、欠落なく編集を再開できる。**

---

## スパイク（Phase 2 着手前）

### [x] S-1 PDF組版ライブラリの比較検証
- 内容：Vivliostyle と Paged.js の両方で、`fixtures/spec-full.json` 相当のHTMLを組版して比較する。本番コードとは別の `spikes/pdf/` で行う。
- 検証項目：
  - 目次のページ番号（`target-counter`）
  - 余白ボックスへのロゴ画像（Data URI）・Copyright・ページ番号・柱（`string-set`）
  - `@page :first` で表紙のヘッダー・フッターを消す
  - 表紙・目次後の改ページ、表・図の途中で改ページしない制御
  - 結合セルを含む表、ページを超える長い表の分割
  - Noto Sans JPでの日本語組版の品質
  - `@page` のカスタムサイズ（mm指定）と、A3・横向きなどのプリセット
  - 名前付きページ（`page: landscape`）で一部の表だけを横向きページに置けるか
  - ブラウザの印刷でのPDF保存結果（カスタムサイズがそのまま保存されるか）
- 成果物：`docs/spike-pdf.md`（比較表、採用ライブラリと理由、制約事項）。結果に合わせて `docs/design.md` §10 を更新。
- 依存：1-6
- メモ：
  - **結論：Vivliostyle（`@vivliostyle/core` 2.45.2）を採用**。詳細は `docs/spike-pdf.md`。決め手は、名前付きページで一部の表だけを横向きにできること（Paged.js は 0.4.3・0.5.0-beta.2 とも不可）と、分割した表で見出し行を繰り返すこと（Paged.js は不可）。
  - ライセンスは AGPL-3.0。社内利用のみで、配布する場合もソース公開でよいことをユーザーに確認済み（2026-10-05）。
  - design.md の §2（技術スタック）・§10（PDFプレビュー）・§12（未決事項）を更新した。
  - 縦横が混在すると、印刷でPDFが正方形になる問題があった。組版後にページごとの名前付きページを割り当てる回避策で、PDFの各ページが正しい用紙サイズになることを確認した（`spikes/pdf/main.js` の `fixVivliostylePrintSizes`）。
  - 確認は Playwright の `page.pdf()` による。実際の印刷ダイアログでの「PDFに保存」は、2-8の受け入れ確認で Chrome / Edge の実機で行う。
  - スパイク専用の依存は `spikes/pdf/package.json` に分けた（アプリの依存には入れていない）。pnpm 11 が依存のpostinstall（`core-js`・`es5-ext`。どちらもメッセージを出すだけ）で止まるため、`spikes/pdf/pnpm-workspace.yaml` の `allowBuilds` で実行しない設定にした。`.claude/launch.json` に `spike-pdf`（ポート5180）を追加し、`.prettierignore` に `spikes` を追加した。

---

## Phase 2：仕様書化

### [x] 2-1 安定IDとラベル計算
- 内容：§5.3 `stableId`、§5.4 `computeLabels` / `formatRef`。heading に `id`・`numbered` 属性を追加。
- 受け入れ基準：
  - 採番テスト：5階層、H6非採番、`numbered=false`、レベル飛び（ルールを決めてテストで固定し、§5.4に追記）
  - コピペで重複したIDが振り直され、元のIDは維持される
- 依存：1-4
- メモ：
  - 依存の追加：`nanoid`（§2で採用済み。ID生成）。
  - **design.md §5.3・§5.4 を更新した**：
    - IDの形式が違えば振り直す（外部HTMLの `id="intro"` など。エクスポートHTMLの要素IDとの衝突を防ぐため）。
    - 重複IDは、編集前の位置をマッピングで追跡し、元のノードのIDを残す（元の見出しの前に貼り付けても、元のIDが変わらない）。
    - 採番ルールを確定した。H6はカウンタに影響しない。`numbered=false` は採番せず、カウンタも進めない。レベル飛びは、飛ばしたレベルを1とみなす（H1→H3 で「1.1.1」、続くH2は「1.2」）。目次にはすべての見出しを入れる。採番しない見出しへの参照は「「題名」」。
  - `computeLabels` / `formatRef` は `src/core/labels/computeLabels.ts`、IDの形式と生成は `src/core/labels/stableIds.ts`（エディターと共用）。図・表（`figure` / `tableFigure`）の採番とキャプションも、JSONのノード名で実装済み（2-3でノードを作れば、そのまま番号が付く）。`tableFigure` の中（セル内）は数えない。
  - エディター側は `src/editor/extensions/numberedHeading.ts`（`numbered` 属性。HTMLでは `data-numbered="false"`）と `stableId.ts`（`id` 属性と appendTransaction）。`stableId` は `heading` / `figure` / `tableFigure` を対象にしているので、2-3でノードを追加すれば自動で対象になる。
  - IDが付くのはエディターのトランザクション経由（`setContent` を含む）だけ。`src/core/import` で読んだ直後のJSONには、まだIDが無い（エディターに入れた時点で付く）。
  - `fixtures/spec-full.json` に見出しのID（`h-spec0001`〜）と、採番しない見出し（付録 用語集）を追記した（0-4の申し送り）。
  - E2E：ヘッドレスのChromiumではキーボードのコピー＆貼り付けがクリップボードにつながらないため、ProseMirror自身の `copy` イベントで得たデータを `paste` イベントで貼り付けて、元の前・後への複製で元のIDが維持されることを確認している。

### [x] 2-2 見出し番号の表示とエクスポート
- 内容：§5.5の `labels` プラグインと見出し番号デコレーション。§7.1の解決済みJSONによる番号出力。見出しの「採番しない」切替UI。
- 受け入れ基準：
  - 見出しの追加・削除・レベル変更で番号が即時に更新される
  - 番号は本文テキストに含まれない（コピーしても番号が入らない）
  - エクスポートHTMLに番号と `id` が出力される
- 依存：2-1
- メモ：
  - 依存の追加はなし。
  - **design.md §7.1 を変更した（ユーザー承認済み）**：番号は「解決済みJSON＋`renderHTML`」ではなく、`generateHTML` の後に DOMParser で本文HTMLを解析し、`id` をもとに差し込む（`src/core/export/resolveLabels.ts`）。番号用の属性をスキーマに持たせると、エディターのJSONに余分な属性が入り、`renderHTML` の hole の制約で本文を余分な要素で包む必要があるため。図・表の番号（2-3）と相互参照（2-4）も同じ方法で差し込む。
  - エディターは `src/editor/extensions/labels.ts`。プラグインの状態に `Labels` とデコレーションを持ち、文書が変わったときだけ計算し直す。番号は `contenteditable="false"` のウィジェット（`span.heading-number`）で、文書には含まれないので、コピーしても入らない（E2Eで確認）。UIからは `getLabels(state)` で参照する（2-4・2-5で使う）。ProseMirrorのノードは、型を偽装するキャストを使わず `toDocNode` でコアの型に変換している。
  - 文書が変わるたびに、文書全体を走査して計算する。大きな文書での性能は未計測（問題があれば、見出し・図表の変更があったときだけ計算し直すよう最適化する）。
  - 「見出し番号」の切り替えボタンは、段落の種類の選択の隣に置いた（H1〜H5 のときだけ有効。押下状態＝採番する）。
  - 出力：`<h2 id="h-…"><span class="heading-number">2.1</span>題名</h2>`。採番しない見出しとH6には付けない。埋め込みJSONには番号を含めない。
  - 既存E2Eの見出しの文字列比較を、番号付きの前提に更新した（`editor` / `export` / `open` / `table`）。クリック直後の操作は、エディターの選択が反映されるのを待つ（`clickIn`）。
  - **採番ルールの変更（2-2完了後、ユーザー要望）**：採番しない見出しの**配下の見出しも採番しない**ようにした（design.md §5.4 を更新）。次に同じか上位のレベルの見出しが現れるまで、より下位の見出しは採番せず、カウンタも進めない。これにより、文書先頭の採番しない「はじめに」（H1）とその下のH2があっても、最初の章は「1」から始まる。配下の見出しにカーソルがあるときは「見出し番号」ボタンを無効にし、ツールチップで理由（上位の見出しが採番しない）を示す。単体テスト・E2Eを追加した。

### [x] 2-3 図・表のキャプションと番号
- 内容：§5.1の `figure`/`figcaption`、`tableFigure`/`tableCaption` とNodeView。画像・表を「キャプション付きにする／外す」操作。parseHTMLで `<figure>` 等を取り込む。
- 受け入れ基準：
  - 本文の図・表に通し番号が付き、並べ替えると更新される
  - 表セル内の画像・表には番号が付かない
  - エクスポートとインポートの往復でキャプションと番号が保持される
- 依存：2-2
- メモ（1-2からの申し送り）：
  - セル内には `figure` / `tableFigure` を置かない（§5.2）。引用やリスト経由で入り得るため、`src/editor/extensions/tableHeadingGuard.ts` を拡張し、セル内の `figure` / `tableFigure` はキャプションを外して `image` / `table` に戻すこと（`toc` は削除する）。
- メモ（2-3の作業）：
  - 依存の追加はなし。
  - **design.md を更新した（ユーザー承認済み）**：
    - §5.5：図・表の番号は NodeView ではなく、見出しと同じ widget デコレーション（`span.caption-number`）で表示する。空のキャプションにはプレースホルダーを表示する。
    - §6：表のキャプション（`<table><caption>`、`<figure><table><figcaption>`）は解析前に `div.table-figure` の形に整える。エクスポートが差し込んだ番号は、外部HTMLの読み込み時と貼り付け時に取り除く。
    - §3・§5.2：ガードの名前を `tableCellGuard` に変えた。
  - ノード：`figure`（`image figcaption`）、`figcaption`、`tableFigure`（`tableCaption table`、`landscape` 属性。UIは2-9）、`tableCaption`（`src/editor/extensions/figure.ts`・`tableFigure.ts`）。`id` は2-1の `stableId` が自動で付ける。
  - 操作（`src/editor/extensions/captions.ts`）：`toggleCaption`（画像を選んで実行すると図にし、キャプションにカーソルを移す。表の中で実行すると、表の上にキャプションを付ける。外すときは、キャプションの文字を段落として残す）、`deleteTableWithCaption`（表の操作メニューの「表を削除」で使う。表だけを消すと `tableFigure` の構造が壊れるため）。セル内の画像・表では実行できない。ツールバーに「キャプション」ボタンを追加した。
  - **図の画像を削除すると、図が空の `<img>` を持つ壊れた状態になる問題を見つけた**（ProseMirrorが、必須の画像を空の画像で補うため）。画像が空になった図は、キャプションの文字の段落に置き換える（キャプションが空なら図ごと消す）`figureRepair` プラグインで対応した。
  - **セル内の制限（1-2からの申し送り）**：`tableHeadingGuard` を `tableCellGuard` に改名・拡張した。セル内に入った `figure` / `tableFigure` は、画像・表とキャプション文字の段落に戻す（貼り付けた場合も含む）。`toc` は2-5でノードを作るときに追加する。
  - 読み込み・貼り付けの整形は `src/core/import/normalizeHtml.ts`（読み込みは `htmlToDoc`、貼り付けは `PasteNormalizer` プラグインから呼ぶ）。
  - エクスポートは `resolveLabels.ts` を拡張し、`figcaption` と `.table-caption` の先頭に `<span class="caption-number">図1</span>` / `表1` を差し込む。
  - `fixtures/spec-full.json` に、図2つとキャプション付きの表2つ（1つは `landscape: true`）を追加した（0-4の申し送り）。
  - 「並べ替え」の受け入れ基準は、図の追加・削除による番号の更新で確認した（ドラッグによる移動は未確認）。

### [x] 2-4 相互参照
- 内容：§5.1 `crossRef`、§5.5のNodeView、§5.6の挿入ダイアログ。エクスポートでは `<a class="xref" href="#id">` で出力。
- 受け入れ基準：
  - 参照先の番号が変わると参照の表示が追従する
  - 参照先を削除すると「参照先なし」と警告表示される
  - 参照先を含む範囲をコピペしても、既存の参照は元の参照先を指したまま
- 依存：2-3
- メモ：
  - 依存の追加はなし。
  - **design.md §5.5・§5.6 を更新した（ユーザー承認済み）**：`crossRef` の表示は NodeView ではなく、labelsプラグインのノードデコレーション（`data-label`、参照先なしは `is-broken`）と、編集UIのCSS（`::before { content: attr(data-label) }`）で行う。参照ノード自体は変わらないため、NodeView では参照先の番号の変化で再描画されないが、デコレーションの変化は反映される。
  - ノード：`crossRef`（インライン・atom、`targetId`）。HTMLは `<span class="xref" data-target-id>`。読み込み時は、エクスポートの `<a class="xref" href="#id">` も取り込む（リンクのマークより優先）。`getText()` での文字は空（番号を文書のテキストに入れないため）。
  - 挿入ダイアログ：ツールバーの「参照を挿入」から開く（`src/editor/ui/CrossRefDialog.tsx`）。見出し（階層で字下げ）・図・表を、番号と題名で表示する。絞り込み、矢印キー、Enter（`isComposing` を判定）、Esc、クリックに対応。
  - エクスポート：`<a class="xref" href="#id">2.1節</a>`、参照先なしは `<span class="xref">参照先なし</span>`（`resolveLabels.ts`）。
  - `fixtures/spec-full.json` に、表・図・採番する見出し・採番しない見出しへの参照を追加した（0-4の申し送り）。
  - E2E上の注意：
    - ダイアログを閉じた後、エディターへのフォーカスの戻りは非同期（TipTapは描画フレームを待つ）。直後のキー操作はエディター以外に効くことがある。
    - macOSのChromeの contenteditable では、`End` で行末に移動しない（`Meta+ArrowRight` を使う）。
    - コピー＆貼り付けの確認では、貼り付け先をAPIで用意している。

### [x] 2-5 目次
- 内容：§5.1 `toc` ノードとNodeView、`tocDepth` 設定。エクスポートでは `.doc-toc` をリンク付きで出力。
- 受け入れ基準：
  - 見出しの変更が目次に即時反映される
  - `tocDepth` を変えると表示深さが変わる
- 依存：2-2
- メモ（2-3からの申し送り）：`toc` ノードを作ったら、`src/editor/extensions/tableCellGuard.ts` にセル内の `toc` を削除する処理を追加する（§5.2）。
- メモ：
  - **設計変更（承認済み）**：文書の content を `toc? block+` にした（`TocDocument`。StarterKit の `document` は無効化）。目次は `block` グループに属さないため、文書の先頭に最大1つだけ置け、セル・リスト・引用には構造上入らない。上記の `tableCellGuard` への追加は不要になった。先頭以外に貼り付けた `nav.doc-toc` は捨てられる。design.md §5.1・§5.2・§5.5・§7.1・§7.2・§8.2 を更新した。
  - ツールバーの「目次」ボタンは、目次が無ければ文書の先頭に挿入し、あれば削除する（`toggleToc`。押下状態を表示）。
  - エディターの表示はNodeView（`src/editor/extensions/toc.ts`）。中身はエクスポートと同じ `renderTocContent`（`src/core/export/toc.ts`）で作る。目次の内容をノードデコレーションのspec（`tocKey`）に載せ、内容が変わったときだけ再描画する。見出しが無いときはプレースホルダーを表示する。項目のクリックでその見出しへスクロールし、カーソルを移す。
  - 深さは、文書設定パネルの「目次に載せる深さ」で変え、文書ごとの上書き（`settingsOverride.tocDepth`）に保存する（`setTocDepth`）。使われる値は `resolveTocDepth`（上書き ＞ テーマの `tocDepth`）。エディターへは `setTocDepth` コマンド（履歴に残らないメタ情報だけのトランザクション）で渡す。テーマの設定値は変えない（テーマの編集は3-1）。
  - エクスポート：文書の先頭の `toc` ノードを本文から除き、`<main>` の前に `<nav class="doc-toc" aria-label="目次">` を出力する。項目は `a.toc-item.toc-level-N[href="#h-…"]`、番号は `span.toc-number`（採番しない見出しには出さない）。表題に `.toc-title` を使うため、テーマ契約に追加した。目次はリスト・段落の要素を使わない（編集画面では `.doc-body` の中にあり、本文用のルールが当たるため）。
  - 外部HTMLとして読み込むと、`nav.doc-toc` は目次ノードになる。
  - テーマ2種に目次のCSSを追加した。編集画面では目次の直後の見出しにも上余白が付くため、`.doc .doc-toc + * { margin-top: 0 }` でエクスポート（`main` の先頭）と揃えた。
  - `fixtures/spec-full.json` の先頭に目次を追加した。
  - PDFのページ番号（`target-counter`）は2-8で追加する。
  - 未実装（範囲外）：画面デザインの左側アウトラインにある「目次」項目（アウトラインのパネル自体が未実装）。

### [x] 2-6 表紙と改訂履歴
- 内容：表紙フォーム（`DocMeta`）と改訂履歴の編集UI（行の追加・削除・並べ替え）。エディター上部にプレビュー表示。§7.1のテンプレートでエクスポート。
- 受け入れ基準：
  - 入力内容がエクスポートHTMLの表紙・改訂履歴に反映される
  - 往復で `meta` と `revisions` が保持される
- 依存：1-4
- メモ：
  - 表紙・改訂履歴のHTMLは `src/core/export/templates.ts`（`renderCover` / `renderRevisions`）で作り、エクスポートとエディター上部のプレビュー（`src/app/DocumentPreface.tsx`）で共通に使う。構造は design.md §7.2 に追記した。テーマ契約の変更はない（改訂履歴の表題は `.doc-revisions h2`）。
  - 表紙は、タイトル・案件名・会社名・顧客名のどれかが入力されているときだけ出力する（日付だけの表紙を出さないため）。版数は「第1.0版」、日付は「2026年10月1日」、顧客名は「〇〇 御中」の形で出力する。改訂履歴は行が無ければ出力しない。内容の改行は `<br>`。
  - 文書設定パネルを「表紙 / 改訂履歴 / テーマ」のタブにした（画面デザインどおり。既定はテーマ。矢印キーでタブを移動）。テーマのタブに、テーマ選択と目次の設定を入れた。
  - 表紙の日付・改訂履歴の日付は空にできない（空にすると直前の値のまま）。改訂履歴の追加では、版数に表紙の版数、日付に今日を入れる。削除は確認なしで即時に行う（元に戻す操作は本文だけが対象なので、誤操作に注意。必要なら確認ダイアログを追加する）。
  - 改訂履歴の一覧操作は `src/core/model/revisions.ts` の純粋関数（追加・更新・削除・並べ替え）。IDは `r-` ＋ nanoid 8文字。
  - プレビューをクリックすると、文書設定の対応するタブを開く。
  - **用紙の構造を変更**：`div.doc > [プレビュー] + div(EditorContent) > div.doc-body`（design.md §8.1）。E2E `editor.spec.ts` の構造の確認を `.doc > .doc-body` から `.doc .doc-body` に変更した。
  - 埋め込みデータの無いHTMLの読み込み・貼り付けでは、`section.doc-cover` / `section.doc-revisions` を取り除く（design.md §6）。
  - テーマ2種に表紙・改訂履歴の画面用CSSを追加した。表紙・改訂履歴の後の改ページは2-8で追加する。

### [x] 2-7 ヘッダー・フッター（ロゴ／Copyright）
- 内容：`ThemeSettings`（ロゴ画像、Copyright）の設定UI、文書ごとの上書き。`buildThemeVars` によるCSS変数注入。エクスポートで `<header>`/`<footer>` を出力。
- 受け入れ基準：
  - ロゴ画像を設定するとData URIで保存・出力される
  - Copyrightに `"` を含めても出力が壊れない
  - ブラウザ表示で文書の先頭・末尾に1回ずつ表示される
- 依存：1-6
- メモ：
  - **上書きの扱い（ユーザー承認済み）**：文書設定 > テーマ > ヘッダー・フッター。「この文書だけ上書きする」がオフのときはテーマの設定値を表示のみ（編集はテーマ編集 3-1）。オンにするとテーマの値を `settingsOverride` にコピーして編集でき、オフに戻すと `settingsOverride` の `logoDataUri` / `copyright` を削除する。オンかどうかは、上書きにどちらかのキーがあるかで判定する（`overridesHeaderFooter`）。ビルトインテーマにはロゴもCopyrightも無いため、現状はオンにしないと設定できない。
  - 値は項目ごとに「文書の上書き ＞ テーマ」（`resolveHeaderFooter`）。Copyrightは空文字で非表示にできる。ロゴは上書きで「表示しない」を表せない（`logoDataUri` は `data:image/` 必須のため。埋め込みデータの形式を変えないための制約）。
  - `buildThemeVars`（`src/core/theme/themeVars.ts`）が `:root{--header-logo:url("…");--copyright:"…";}` を作る。文字列は `escapeCssString`（`src/core/export/escape.ts`。`"`・`\`・改行・制御文字）でエスケープし、`<style>` 全体を `escapeStyleContent` で保護する。エクスポートは `<style id="theme-vars">`、エディターも同じ内容を `<style data-theme-vars>` で注入する。
  - エクスポート：ロゴは `header.doc-header > img.doc-logo`（文書の先頭）、Copyrightは `footer.doc-footer > span.doc-copyright`（文書の末尾）。値が無ければ出力しない。エディターでも用紙の先頭・末尾に同じテンプレートで表示し、クリックで「テーマ」タブを開く。
  - ロゴはPNG / JPEG / SVGを `openImage` でData URIとして読む。サイズの上限は設けていない（大きな画像はエクスポートと自動保存の容量を増やす。1-5のメモ参照）。
  - 埋め込みデータの無いHTMLの読み込み・貼り付けでは、`header.doc-header` / `footer.doc-footer` も取り除く。
  - 既存の単体テストの期待値を2件変更した：エクスポートの `</style>` の数（theme-vars が増えて2つ）、出力順のテストにフッターを追加（テスト用の状態がCopyrightを上書きしているため）。
  - テーマ2種にヘッダー・フッターの画面用CSSを追加した。PDFでの非表示と余白ボックスへの配置は2-8。

### [x] 2-8 PDFプレビュー
- 内容：§10をS-1で採用したライブラリで実装。ビルトインテーマ2種に `@page` ルールを追加。
- 受け入れ基準：
  - ページ番号付きの目次、ヘッダー・フッター、柱が表示される
  - 表紙にヘッダー・フッターが出ない
  - ブラウザの印刷で「PDFに保存」した結果がプレビューと一致する
- 依存：S-1、2-5、2-6、2-7
- メモ（S-1からの申し送り）：`docs/spike-pdf.md` §3.2・§4 を参照。縦横混在時の印刷サイズの回避策、`authorStyleSheet` での CSS の渡し方、長い表に `break-inside: avoid` を付けると直前のページが空く問題、柱の「1はじめに」が詰まる問題、大きな文書での組版時間の計測。
- メモ：
  - **依存パッケージを追加**：`@vivliostyle/core` 2.45.2（S-1で採用した組版ライブラリ。AGPL-3.0、社内利用の前提で了承済み）、`@fontsource/noto-sans-jp` 5.3.0（PDFで書体を統一する日本語Webフォント。OFL。プレビューの `iframe` でだけ読み込む）。
  - **構成（設計変更、承認済み）**：組版は別ページ `pdf-preview.html`（`src/pdf/main.ts`）で行い、プレビュー画面（`src/app/pdf/PdfPreview.tsx`）に `iframe` で表示する。アプリのCSSが組版結果に影響せず、印刷は `iframe` の中だけになる。親画面は `window.shitatePdf`（`src/pdf/api.ts` の `PdfFrameApi`）を直接呼ぶ。Viteは複数ページ構成（`vite.config.ts` の `build.rollupOptions.input`）。
  - PDF用CSSは `src/core/pdf/`：`PDF_BASE_CSS`（書体の統一、`.doc` の幅・余白の解除、ヘッダー・フッターの非表示、表紙・改訂履歴・目次の後の改ページ、目次のリーダーとページ番号 `leader(dotted) target-counter(...)`、見出し・表キャプションの `break-after: avoid`、図と行の `break-inside: avoid`、`thead` の繰り返し）と `buildPageCss` / `resolvePageSettings`（2-9で使うページ設定。現状は既定のA4縦。B4はJIS B4）。テーマCSSの後に `authorStyleSheet` で渡す。
  - ビルトインテーマ2種に `@page`（左上ロゴ、右上柱、左下Copyright、右下「ページ / 総ページ」、`@page :first` で全て `none`）と `h1` の `string-set` を追加した。
  - S-1の申し送りへの対応：
    - 縦横混在の印刷サイズ：`fixPrintPageSizes`（`src/pdf/printSizes.ts`）として本番化。E2Eで、プレビューの各ページの用紙サイズと `page.pdf()`（Chromiumの印刷処理）のPDFの各ページのサイズが一致すること（A4縦＋A4横）を確認している。
    - 長い表の直前のページが空く問題：`.table-figure` に `break-inside: avoid` を付けず、キャプションの `break-after: avoid` と行の `break-inside: avoid` だけにした。
    - 柱の「1はじめに」：計画ではエクスポートにも空白を入れる予定だったが、**PDF用にだけ**見出し番号の後に空白を入れる形に変更した（`prepareHtmlForPdf`）。エクスポートに入れると、編集画面（デコレーション）と出力で番号と題名の間隔が変わり、既存E2Eの多くの期待値も変わるため。納品HTMLは変わらない（E2Eで確認）。
    - 組版時間（開発サーバー、Mac・Chromium、`spec-full.json` を繰り返した文書）：5ページ 約0.9秒、76ページ 約3.9秒、107ページ 約5.7秒、213ページ 約15秒。組版中は「組版しています…（N ページ）」と進み具合を表示する。
  - 表示の切り替えは「1ページ / 見開き」×「全体 / 100%」、ページ送りは ‹ › と矢印キー（`iframe` にフォーカスがあっても有効）。画面デザインの「見開き3ページ」は Vivliostyle の表示方式に無いため変更した（承認済み）。目次・相互参照のリンクをクリックすると、そのページへ移動する。
  - 組版の前に `document.fonts.load` で、文書の文字を含む Noto Sans JP（400 / 700）のサブセットを読み込む。
  - **制約**：表紙のヘッダー・フッターは `@page :first` で消すため、表紙が無い文書では1ページ目にもヘッダー・フッターが出ない。横向きの表の直前の見出しは、ページの種類が変わるため `break-after: avoid` が効かず、前のページの末尾に残る（`spec-full.json` の「3.1.1.2 桁数チェック」）。
  - **不具合修正（2-8完了後）**：PDFのロゴが画像の元のサイズで描画されていた（`@top-left { content: var(--header-logo) }` の画像は縮小できない）。テーマ2種で、余白ボックスの背景画像として `background-size: auto 8mm`（高さ8mm、ボックス幅60mm、下端から3mm）で描画するよう変更した。幅60mmを超える横長のロゴは右側が切れる。E2Eの確認も、`img` の有無から背景画像と縮小サイズの確認に変更した。
  - 実際の印刷ダイアログで「PDFに保存」した結果（縦横混在の用紙サイズ、ヘッダー・フッター）は、ユーザーが実機で確認し問題なし（2026-10-08。`spec-full.json` を使用）。

### [x] 2-9 ページ設定
- 内容：§4 `PageSettings` と §10.1。`buildPageCss` の実装、文書設定パネルの「ページ」セクション（サイズ、向き、余白、基準文字サイズ）、文書ごとの上書き、表の横向き指定（`tableFigure.landscape`）。
- 受け入れ基準：
  - `buildPageCss` の単体テスト：プリセット、カスタムサイズ、既定値の適用、上書きの優先順位
  - A3横やカスタムサイズを選ぶと、PDFプレビューと保存したPDFのページサイズが変わる
  - 基準文字サイズを変えると、編集画面とPDFの両方の文字サイズが変わる
  - 横向き指定した表だけが、PDFで横向きページに配置される
  - 往復でページ設定と表の横向き指定が保持される
- 依存：2-8、2-3
- メモ：
  - `buildPageCss` / `resolvePageSettings` は2-8で `src/core/pdf/pageCss.ts` に実装済み（design.md §10.1 の場所の記載を更新）。サイズはmmで書き込み、B4はJIS B4（257×364mm）。カスタムは短い辺を幅とし、向きは `orientation` で決める。
  - ページ設定のUI：文書設定 > テーマ > 「ページ（PDF）」（サイズ、カスタムの幅・高さ、向き、余白、基準文字サイズ 9〜12pt・0.5pt刻み）。変更は `settingsOverride.page` に保存し、テーマは変えない。「テーマの設定に戻す」で上書きを削除する。カスタムの幅・高さは、範囲外（100〜1000mm）や数値でない入力を保存せず、入力欄の下にエラーを表示する（最後に有効だった値が使われる）。
  - **設計からの拡張（承認済み）**：`--base-font-size` を `buildThemeVars` の `:root` 変数に加え、編集画面に加えてエクスポートHTMLにも出力する（編集画面と納品HTMLの文字サイズを揃えるため）。PDFは `buildPageCss` の `.doc { --base-font-size }` でも同じ値を指定する。
  - 表の横向き指定：表の操作メニューに「PDFで横向き」の切り替え（`aria-pressed`）を追加した（`toggleTableLandscape`、`findTableFigure`）。キャプションの無い表では押せない（理由はツールチップに表示。アクセシブルネームは「PDFで横向き」で固定）。横向き指定した表には、編集画面だけ「PDFで横向き」の印を表示する（`editor-ui.css` の `::before`）。
  - E2E：A3横・カスタム（182×257mm）でプレビューと `page.pdf()` のページサイズが変わること、無効なカスタムサイズを保存しないこと、基準文字サイズで編集画面とPDFの文字サイズが変わり「テーマの設定に戻す」で戻ること、横向き指定した表のページだけが横向きになること（キャプションの無い表では押せない）、エクスポート→読み込みでページ設定と横向き指定が保持されることを確認している。
  - 全E2Eの初回実行で `pdf.spec.ts` のページ送りのテストが1回だけタイムアウトした（同時に失敗した2件は、メニューのボタン名が「キャプション」を含んでいたことが原因で、修正済み）。その後、全E2Eを3回続けて実行し、すべて成功した。

### [x] 2-10 画像のリサイズ
- 内容：§5.1。本文・図・セル内の画像を、角のハンドルのドラッグでリサイズする（縦横比を保つ）。サイズは `image` の `width` / `height`（px）に保存する。
- 受け入れ基準：
  - ドラッグで画像の幅が変わり、縦横比が保たれる。用紙幅より大きくならない
  - 図の画像はリサイズ後も中央寄せのまま
  - エクスポートHTMLに `width` / `height` が出力され、往復（埋め込みデータ・外部HTMLとしての読み込み）で保持される
- 依存：2-3
- メモ：
  - ユーザーの依頼で追加したタスク（Phase 3 完了後に実施）。依存パッケージの追加なし（`@tiptap/extension-image` 3.31.4 の `resize` オプションを使用）。
  - `ResizableNodeView` は `img` を `div[data-resize-container] > div[data-resize-wrapper]` で包み、コンテナに `display: flex` をインラインで指定する。テーマの `text-align`（図の中央寄せ）が効くよう、`editor-ui.css` でコンテナを `block`、ラッパーを `inline-block` に上書きした。ライブラリが `img` に書き込むpxの高さは `height: auto !important` で無効にし、`max-width: 100%` で縮んだときも縦横比を保つ。
  - 選択枠はコンテナ（行幅いっぱい）ではなくラッパー（画像）に付ける。ハンドルはホバー中・選択中だけ表示し、小さな画像でもクリックを奪わないよう、選択枠の角に中心を置いた。
  - 画像がラッパーで包まれるため、E2Eの `td > img` / `:scope > img + p` を `[data-node="image"]` を含むセレクタに変更した（確認内容は同じ）。
  - リサイズはマウス操作のみ（キーボードでのサイズ変更、数値入力、サイズのリセットは未対応）。サイズを指定しない状態に戻すUIが必要なら別タスクにする。
  - E2Eは `tests/e2e/image-resize.spec.ts`。単体テストは `export.test.ts` の「resized images」。

### [x] 2-11 エクスポートHTMLの画像拡大表示
- 内容：§7.3。エクスポートHTMLで、縮小表示されている本文の画像をクリックすると、元のサイズで表示する（図はキャプションも表示）。ウィンドウより大きい画像は、ウィンドウに収まるよう縮小する。
- 受け入れ基準：
  - リサイズした画像・用紙幅で縮小された画像をクリックすると、元のサイズで表示される。図ではキャプション（番号付き）も表示される
  - 元のサイズで表示されている画像では開かない
  - ウィンドウより大きい画像は、キャプションと合わせてウィンドウ内に収まる（縦横比を保ち、元のサイズより大きくしない。ウィンドウのリサイズに追従する）
  - Esc・閉じるボタン・背景のクリックで閉じる。キーボード（Enter）でも開ける
  - PDFに渡すHTMLにはスクリプトを含めない。埋め込みデータと往復は変わらない
- 依存：2-10
- メモ：
  - ユーザーの依頼で追加したタスク。依存パッケージの追加なし。
  - エクスポートHTMLに初めて実行されるスクリプト（インライン）が入った。既存の単体テストのうち、`<script>` / `<style>` の数を数えていたもの（エスケープ、ヘッダー・フッター）は、ビューアの分を含めた期待値に変え、増えた要素がビューアのものであることも確認するようにした。
  - 文書のデータから要素を作るのはキャプションの複製（`cloneNode`）だけで、`innerHTML` は使っていない。
  - ビューアの見た目（暗い背景、白いキャプション）はテーマに関係なく固定。テーマごとに変えたい場合は、契約にクラスを追加する別タスクにする。
  - E2Eは `tests/e2e/image-viewer.spec.ts`、単体テストは `export.test.ts` の「image viewer」。
  - **ユーザーの依頼で変更**：当初は画面より大きい画像を元のサイズのまま表示してスクロールさせていたが、見にくいため、ウィンドウに収まるよう縮小する仕様に変えた。縮小の倍率は、CSSだけでは縦横比とキャプションの位置を保てないため、スクリプトで計算する。
  - 既存E2Eの変更：`header-footer.spec.ts`（`<script>` の数 → 埋め込みデータとビューアの2つで、注入が無いこと）、`pdf.spec.ts`（納品HTMLとPDF用HTMLの一致 → ビューア部分を除いて一致すること）。
  - 全E2Eを3回続けて実行したところ、1回だけ `pdf.spec.ts` の「turns pages and switches the view」が失敗した（2-9のメモと同じ既知の不安定なテスト。PDF用HTMLにはビューアを含めないので、今回の変更とは無関係と判断）。`pdf.spec.ts` を5回繰り返した実行（20件）はすべて成功した。

### [x] 2-12 JSONインポート：段落内の画像の補正
- 内容：§6。TipTap JSONの `paragraph` 直下にある `image` を段落の外に出してから検証する（画像はブロックノードのため、そのままではスキーマ違反で読み込めない）。
- 受け入れ基準：
  - `paragraph > image` を含むJSONを読み込める。画像の前後の文字は別の段落として残る
  - リスト項目・表のセル・引用の中の段落でも同様に補正される
  - 補正の不要なJSONは変わらない（既存のJSONインポートと往復テストが通る）
- 依存：1-3
- メモ：
  - ユーザーの依頼で追加したタスク。依存パッケージの追加なし。
  - 補正は `src/core/import/liftImages.ts` の `liftImagesFromParagraphs`（純粋関数）。`jsonToDoc` でスキーマ検証の前に呼ぶ。単体テストは `liftImages.test.ts`。
  - 対象は `paragraph` のみ。`heading`・キャプション（`figcaption` / `tableCaption`）内の画像は従来どおりエラーになる。必要になれば別タスクにする。
  - 段落から出した画像の `marks`（リンク等）はそのまま残すので、付いていればスキーマ検証でエラーになる。

### [x] 2-13 コードブロックのシンタックスハイライト
- 内容：§5.7。コードブロックに言語を設定し、エディターとエクスポートHTML（PDFを含む）で色付けする。文書に保存するのは `codeBlock.language` だけ。
- 受け入れ基準：
  - コードブロックの言語を選択欄で選べる（「テキスト」＋対応15言語）。選ぶと色が付き、編集に追従する。言語の変更はUndoできる
  - 別名（`ts`、`sh`、`html` など）は対応する言語として扱う。言語なし・未対応の言語は色を付けない（自動判定しない）。未対応の値は文書に残る
  - エクスポートHTMLのコードブロックが `<span class="hljs-…">` で色付けされ、選択欄は出力されない。埋め込みデータと往復は変わらない
  - テーマは `hljs-` で始まるクラスで色を指定でき、ビルトインテーマ2つに配色がある
- 依存：1-2、3-1
- メモ：
  - ユーザーの依頼で追加したタスク。
  - **依存パッケージを追加**：`@tiptap/extension-code-block-lowlight` 3.31.4（エディターのデコレーション）、`lowlight` 3.3.0 と `highlight.js` 11.12.0（字句分割と文法。どれもBSD-3-Clause / MIT）。文法は対応15言語だけを個別にimportしている。
  - **design.md を更新**：§2（技術スタック）、§3（構成）、§5.1（codeBlock の行）、§5.7（新設）、§7.1（手順2）、§8.2（テーマ契約に `hljs-` 接頭辞を追加）。契約の検査は `THEME_CONTRACT_CLASS_PREFIXES`。`hljs-title function_` の `function_` のような修飾クラスは契約に含めていない。
  - CodeBlockLowlight は言語なしのとき `highlightAuto` を呼ぶため、自動判定をしない lowlight のラッパーを渡している（`src/editor/extensions/codeBlock.ts`）。
  - エクスポートでは、`generateHTML` の結果のうち `<pre><code class="language-x">` の中身を文字参照を戻してから字句分割し、エスケープし直して出力する（`core/export/highlightCode.ts`）。入れ子の要素はクラスを連結した平坦な `<span>` にしており、エディターのデコレーションと同じ形になる。
  - 言語の選択欄は、コードの1行目に重ならないよう、ホバー時とキーボードでフォーカスしたときだけ表示する。
  - 単体テストは `core/highlight/highlight.test.ts`・`core/export/highlightCode.test.ts`・`export.test.ts` の「code highlighting」・`theme.test.ts`。E2Eは `tests/e2e/code-highlight.spec.ts`。

**Phase 2 完了条件：ページ番号付きの目次を持つ仕様書PDFを、任意のページサイズで出力できる。**

---

## Phase 3：テーマ管理

### [x] 3-1 テーマ編集画面
- 内容：CSSエディター（CodeMirror等）＋プレビュー。ビルトイン編集時は複製してユーザーテーマ化（§8.4）。
- 受け入れ基準：
  - ビルトインを編集してもビルトイン自体は変わらない
  - 「初期状態に戻す」で `baseId` のCSSに戻る
- 依存：2-9
- メモ：
  - **依存パッケージを追加**：`codemirror` 6.0.2 と `@codemirror/lang-css` 6.3.1（CSSエディター。MIT）。テーマ編集画面は `React.lazy` で必要時に読み込み、ビルドでは別チャンク（約450kB）になる。通常の編集画面のチャンクは約18kB増えただけ。
  - 範囲：3-1で、テーマ編集画面、ユーザーテーマの保存（`themes` ストア）と読み込み、テーマ選択への表示まで実装した。画面デザインの「テーマを複製」「読み込み」「書き出し」「削除」は3-2で実装する。
  - 編集の流れは design.md §8.4 に追記した。ビルトインは `createEditableTheme` で編集用コピー（`theme-xxxxxxxx`、`baseId`、「標準（編集）」）にし、保存して初めて登録する。ユーザーテーマと、文書に埋め込まれていた手元に無いテーマは同じIDで上書き保存する（埋め込みのテーマが古い版のビルトイン、つまり `builtIn: true` の場合はコピーにする）。保存したテーマを文書のテーマにする。
  - 「初期状態に戻す」はCSSだけを `baseId` のビルトインに戻す（設定値は戻さない）。CSSが既に同じときは押せない。
  - 設定値タブでテーマの設定値（ロゴ、Copyright、目次の深さ、ページ設定）を編集できる。2-7・2-9で「テーマ側は3-1で編集」としていた部分。ページ設定の入力欄は `PageSettingsFields`（`src/app/panels/`）として文書設定パネルと共用にした。
  - テーマ契約の検査を構造化した：`checkThemeContract`（違反の種類と対象を返す）と、画面用の日本語メッセージ `formatViolationForUser` を追加した。既存の `findThemeContractViolations`（英語の文字列）は互換のため残している。違反があると保存できない。
  - プレビュー：画面は、現在の文書を編集中のテーマでエクスポートしたHTMLを `iframe`（`srcdoc`、`sandbox`）に、0.55倍に縮小して表示する（縮小のスタイルはプレビューにだけ足し、テーマには含めない）。PDFは2-8のプレビュー用ページで組版する。どちらも入力が止まってから0.4秒後に更新する。
  - テーマ編集画面は全画面で重ねて表示するため、エラーは画面内に表示する（アプリの通知は下に隠れるため）。
  - ユーザーテーマの読み込み（起動時）は `parseStoredThemes` で検証し、壊れたデータやビルトインと同じIDのものは読み飛ばして件数を警告する。
  - テーマ選択の一覧：ビルトイン → ユーザーテーマ（「標準をもとに編集」など）→ 文書に埋め込まれていた手元に無いテーマ。文書のテーマが同じIDで同じCSSのユーザーテーマなら、ユーザーテーマとして選択状態にする。
  - 幅の狭い画面では、テーマ一覧とプレビューの列が縮む（`clamp`）。
  - E2Eでは、CodeMirror は表示中の行しかDOMに持たないため、編集中のCSSを画面プレビューの `<style id="theme">` から読んで確認している。

### [x] 3-2 テーマの追加・複製・削除とファイル入出力
- 内容：ユーザーテーマの管理UI、テーマ単体JSONのインポート・エクスポート。使用中テーマを削除しようとしたら確認する。
- 受け入れ基準：エクスポートしたテーマを別環境でインポートし、同じ見た目になる
- 依存：3-1
- メモ：
  - テーマ編集画面の一覧の下に「テーマを複製」「読み込み」「書き出し」「削除」を追加した（画面デザインどおり）。処理は `src/core/theme/themeFile.ts`（`serializeThemeFile` / `parseThemeFile` / `planThemeImport` / `duplicateTheme` / `themeFileName`）。design.md §8.4 に追記した。
  - 「追加」は「複製」と「読み込み」で行う（画面デザインに追加ボタンは無い）。複製はビルトインにも使え、すぐ保存する。名前は「標準のコピー」（重なれば「 2」「 3」…）、`baseId` を引き継ぐので複製でも「初期状態に戻す」が使える。
  - **テーマファイルの形式（承認済み）**：`{ "format": "shitate-theme", "version": 1, "theme": Theme }`（`テーマ名.theme.json`）。読み込みでは形式・版・`themeSchema`・テーマ契約を検査し、違反は登録しない。
  - 読み込みのID：同じIDで同じ内容なら「既にユーザーテーマにあります」と知らせて追加しない（キーの順序に依らず比較する）。内容が違えば新しいIDで追加し、手元のテーマは上書きしない。ビルトインを書き出したファイルはユーザーテーマのコピーとして追加する。手元に無いビルトインを指す `baseId` は外す。読み込んだテーマは一覧で選択状態にするが、文書のテーマは変えない。
  - 「複製」「書き出し」は保存済みの内容が対象で、未保存の変更がある間は押せない。保存前のビルトインのコピーを開いている場合は、ビルトイン自体が対象。
  - 削除はユーザーテーマだけで、必ず確認する。文書で使用中のテーマは、削除しても文書のコピーを「この文書に含まれていたテーマ」として残す（`keepThemeInDocument`）。見た目は変わらない。
  - テーマ編集画面の通知を、エラーだけでなく警告（既にある、など）も出せるようにした。
  - E2E：書き出したテーマを、IndexedDB が空の別のブラウザコンテキストで読み込み、CSS・設定値（Copyright）と、文書の計算後のスタイル（段落の色・字間・書体・文字サイズ、見出しの罫線）が一致することを確認している（受け入れ基準）。ほかに、同じテーマの二重読み込み、壊れたファイル・契約違反のファイル、複製（ビルトイン・ユーザーテーマ・未保存時は押せない）、使用中テーマの削除と再読み込み後に消えていることを確認している。
  - design.md §6 の「自己形式HTMLの埋め込みテーマIDが手元に無い場合は、同梱の theme をユーザーテーマとして登録する」は、1-6以降「この文書に含まれていたテーマ」として選択肢に残す方式で実装している（自動登録はしない）。設計書の記載と実装が異なるため、どちらに合わせるか決める必要がある。

---

## Phase 4：デスクトップ化

### [ ] 4-1 Electron化
- 内容：Electronのメインプロセスを追加し、`FileAdapter` をNode.jsのファイルAPI（ダイアログ経由）で実装。`StorageAdapter` はIndexedDBのままでよい。
- 受け入れ基準：
  - WindowsとMacで起動し、読込・エクスポート・自動保存が動く
  - 同じ文書から出力したPDFのページ割りが両OSで一致する
- 依存：3-2
