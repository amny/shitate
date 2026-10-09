import { THEME_CONTRACT_VARIABLES } from '../../core/theme/contract';

/** Classes a theme may use, grouped as in the theme contract (design.md §8.2). */
const CLASS_GROUPS: readonly { title: string; classes: string; note: string }[] = [
  { title: '文書全体', classes: '.doc', note: 'すべてのルールはこのクラスの下に書きます' },
  {
    title: 'ヘッダー／フッター',
    classes: '.doc-header, .doc-footer, .doc-logo, .doc-copyright',
    note: 'ブラウザ表示用。PDFでは @page の余白ボックスを使います',
  },
  {
    title: '表紙',
    classes:
      '.doc-cover, .cover-title, .cover-project, .cover-version, .cover-date, .cover-company, .cover-client',
    note: '',
  },
  { title: '改訂履歴', classes: '.doc-revisions', note: '中は h2 と table です' },
  {
    title: '目次',
    classes: '.doc-toc, .toc-title, .toc-item, .toc-level-1〜.toc-level-5, .toc-number',
    note: '編集画面では .doc-body の中、出力では本文の前に置かれます',
  },
  {
    title: '本文',
    classes:
      '.doc-body, .heading-number, figure, figcaption, .table-figure, .table-figure.is-landscape, .table-caption, .caption-number, .xref',
    note: 'h1〜h6、p、table などの要素セレクタも .doc の下で使えます',
  },
  {
    title: 'コードのハイライト',
    classes: '.hljs-keyword, .hljs-string, .hljs-comment, .hljs-title など（hljs- で始まるクラス）',
    note: 'コードブロックの言語に応じて付きます。クラス名は highlight.js と同じです',
  },
];

const VARIABLE_NOTES: Readonly<Record<string, string>> = {
  '--header-logo': 'ロゴ画像（url("data:…")）',
  '--copyright': 'Copyright の文字列',
  '--base-font-size': '本文の基準文字サイズ（ページ設定）',
};

/** "使えるクラス" tab of the theme editor. */
export function ContractReference() {
  return (
    <div className="contract-reference">
      <table>
        <thead>
          <tr>
            <th scope="col">対象</th>
            <th scope="col">クラス</th>
          </tr>
        </thead>
        <tbody>
          {CLASS_GROUPS.map((group) => (
            <tr key={group.title}>
              <th scope="row">{group.title}</th>
              <td>
                <code>{group.classes}</code>
                {group.note && <div className="contract-note">{group.note}</div>}
              </td>
            </tr>
          ))}
          {THEME_CONTRACT_VARIABLES.map((name) => (
            <tr key={name}>
              <th scope="row">CSS変数</th>
              <td>
                <code>{name}</code>
                <div className="contract-note">{VARIABLE_NOTES[name] ?? ''}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="contract-rules">
        <li>
          <code>@page</code> には <code>size</code> と <code>margin</code>{' '}
          を書かないでください（ページ設定から生成します）。余白ボックスと <code>:first</code>{' '}
          は書けます。
        </li>
        <li>
          <code>@import</code> と <code>@font-face</code> は使えません（出力は外部を参照しません）。
        </li>
        <li>表のセル内の余白に :first-child / :last-child を使わないでください。</li>
      </ul>
    </div>
  );
}
