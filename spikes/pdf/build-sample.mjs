// Generates sample.html: a spec document with every Phase 2 element the PDF must handle.
// Markup follows the theme contract (docs/design.md §8.2) and the export structure (§7.2).
import { readFileSync, writeFileSync } from 'node:fs';

const logo = readFileSync(new URL('./logo.txt', import.meta.url), 'utf8').trim();
const figureImage = readFileSync(new URL('./figure.txt', import.meta.url), 'utf8').trim();
const themeCss = readFileSync(new URL('../../src/themes/standard.css', import.meta.url), 'utf8');

const headings = [];
let figureNo = 0;
let tableNo = 0;
const counters = [0, 0, 0, 0, 0];

function heading(level, text) {
  counters[level - 1]++;
  counters.fill(0, level);
  const number = counters.slice(0, level).join('.');
  const id = `h-${number.replaceAll('.', '-')}`;
  headings.push({ id, level, number, text });
  return `<h${level} id="${id}"><span class="heading-number">${number}</span>${text}</h${level}>`;
}
const p = (text) => `<p>${text}</p>`;
const para = (n) =>
  Array.from({ length: n }, (_, i) =>
    p(
      `本システムは顧客情報を一元管理し、問い合わせ対応の効率化を図る。${i + 1}番目の段落では、画面設計と機能設計の前提となる業務要件を説明する。` +
        '日本語の組版では、句読点のぶら下がりや禁則処理、和欧混植の間隔が読みやすさに影響する。API（Application Programming Interface）やHTTP 200などの英数字も含める。',
    ),
  ).join('\n');
function figure(caption) {
  figureNo++;
  return `<figure id="f-${figureNo}"><img src="${figureImage}" alt="${caption}"><figcaption><span class="caption-number">図${figureNo}</span>${caption}</figcaption></figure>`;
}
function tableFigure(caption, table, { landscape = false } = {}) {
  tableNo++;
  return `<div class="table-figure${landscape ? ' is-landscape' : ''}" id="t-${tableNo}"><div class="table-caption"><span class="caption-number">表${tableNo}</span>${caption}</div>${table}</div>`;
}
const xref = (id, label) => `<a class="xref" href="#${id}">${label}</a>`;

const mergedTable = `<table><thead><tr><th>区分</th><th>画面ID</th><th>画面名</th><th>主な機能</th></tr></thead><tbody>
<tr><td rowspan="2">共通</td><td>SC-01</td><td>ログイン</td><td><ul><li><p>ID・パスワード認証</p></li><li><p>パスワード再設定</p></li></ul></td></tr>
<tr><td>SC-02</td><td>メニュー</td><td>権限に応じた機能メニューの表示</td></tr>
<tr><td rowspan="2">顧客</td><td>SC-10</td><td>顧客一覧</td><td>条件検索、CSV出力</td></tr>
<tr><td>SC-11</td><td>顧客詳細</td><td><table><tr><th>値</th><th>表示名</th></tr><tr><td>1</td><td>個人</td></tr><tr><td>2</td><td>法人</td></tr></table></td></tr>
<tr><td colspan="3">備考</td><td>管理者画面は別表とする。</td></tr></tbody></table>`;

const longRows = Array.from(
  { length: 70 },
  (_, i) =>
    `<tr><td>F-${String(i + 1).padStart(3, '0')}</td><td>機能${i + 1}</td><td>${['高', '中', '低'][i % 3]}</td><td>入力値を検証し、結果を画面に表示する。</td></tr>`,
).join('');
const longTable = `<table><thead><tr><th>機能ID</th><th>機能名</th><th>優先度</th><th>概要</th></tr></thead><tbody>${longRows}</tbody></table>`;

const wideCols = 14;
const wideTable = `<table><thead><tr>${Array.from({ length: wideCols }, (_, i) => `<th>項目${i + 1}</th>`).join('')}</tr></thead><tbody>${Array.from(
  { length: 8 },
  (_, r) => `<tr>${Array.from({ length: wideCols }, (_, c) => `<td>値${r + 1}-${c + 1}</td>`).join('')}</tr>`,
).join('')}</tbody></table>`;

const body = [
  heading(1, 'はじめに'),
  para(2),
  heading(2, '目的'),
  para(1),
  p(`画面の一覧は${xref('t-1', '表1')}、レイアウトは${xref('f-1', '図1')}、入力チェックは${xref('h-3-1-1', '3.1.1節')}を参照。`),
  heading(2, '対象範囲'),
  para(2),
  heading(1, '画面設計'),
  heading(2, '画面一覧'),
  tableFigure('画面一覧', mergedTable),
  para(1),
  heading(2, '画面レイアウト'),
  figure('顧客一覧画面レイアウト'),
  para(3),
  heading(1, '機能設計'),
  heading(2, '顧客登録'),
  heading(3, '入力チェック'),
  heading(4, '必須チェック'),
  heading(5, '氏名'),
  para(1),
  heading(5, 'メールアドレス'),
  para(1),
  heading(2, '機能一覧'),
  p('機能の一覧を次の表に示す（ページをまたぐ長い表）。'),
  tableFigure('機能一覧', longTable),
  heading(2, '項目定義'),
  p('列の多い表は横向きのページに配置する。'),
  tableFigure('項目定義（横向き）', wideTable, { landscape: true }),
  para(2),
  heading(1, 'データ設計'),
  figure('ER図'),
  para(4),
].join('\n');

const toc = headings
  .filter((h) => h.level <= 3)
  .map(
    (h) =>
      `<li class="toc-item toc-level-${h.level}"><a href="#${h.id}"><span class="toc-number">${h.number}</span>${h.text}</a></li>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>顧客管理システム 基本設計書</title>
<style id="theme-vars">:root { --header-logo: url("${logo}"); --copyright: "© 2026 株式会社サンプル \\"引用\\""; }</style>
<style id="theme">${themeCss}</style>
<link rel="stylesheet" href="./print.css">
</head>
<body>
<div class="doc">
<header class="doc-header"><img class="doc-logo" src="${logo}" alt="株式会社サンプル"></header>
<section class="doc-cover">
<div class="cover-project">顧客管理システム</div>
<h1 class="cover-title">基本設計書</h1>
<div class="cover-version">第1.2版</div>
<div class="cover-date">2026年10月5日</div>
<div class="cover-client">顧客株式会社 御中</div>
<div class="cover-company">株式会社サンプル</div>
</section>
<section class="doc-revisions"><h2>改訂履歴</h2><table><thead><tr><th>版</th><th>日付</th><th>内容</th><th>担当</th></tr></thead><tbody>
<tr><td>1.0</td><td>2026-09-01</td><td>初版</td><td>山田</td></tr>
<tr><td>1.1</td><td>2026-09-15</td><td>画面設計を追加</td><td>佐藤</td></tr>
<tr><td>1.2</td><td>2026-10-01</td><td>機能一覧を更新</td><td>山田</td></tr></tbody></table></section>
<nav class="doc-toc"><h2>目次</h2><ol>
${toc}
</ol></nav>
<main class="doc-body">
${body}
</main>
<footer class="doc-footer"><span class="doc-copyright">© 2026 株式会社サンプル</span></footer>
</div>
</body>
</html>
`;
writeFileSync(new URL('./public/sample.html', import.meta.url), html);
console.log(`sample.html: ${headings.length} headings, ${figureNo} figures, ${tableNo} tables`);
