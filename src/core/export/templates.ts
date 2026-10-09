import type { DocMeta, Revision } from '../model';
import type { HeaderFooterSettings } from '../theme/themeVars';
import { escapeHtml } from './escape';

export const REVISIONS_TITLE = '改訂履歴';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-01" -> "2026年10月1日". Text that is not an ISO date is returned as is. */
export function formatJapaneseDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${year ?? ''}年${String(Number(month))}月${String(Number(day))}日`;
}

/** Escaped text with line breaks kept as <br>. */
function multiline(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br>');
}

/** The cover is output only when it says something besides the date. */
export function hasCover(meta: DocMeta): boolean {
  return [meta.title, meta.projectName, meta.companyName, meta.clientName ?? ''].some(
    (value) => value.trim() !== '',
  );
}

/**
 * The cover (design.md §7.2), or '' when there is nothing to show. Shared by the export and
 * the editor's preview. Empty items are left out.
 */
export function renderCover(meta: DocMeta): string {
  if (!hasCover(meta)) return '';
  const item = (tag: string, className: string, text: string) =>
    text.trim() === '' ? '' : `<${tag} class="${className}">${multiline(text.trim())}</${tag}>`;
  const client = meta.clientName?.trim() ?? '';
  const version = meta.version.trim();
  return [
    '<section class="doc-cover" aria-label="表紙">',
    client === '' ? '' : item('div', 'cover-client', `${client} 御中`),
    item('div', 'cover-project', meta.projectName),
    item('h1', 'cover-title', meta.title),
    version === '' ? '' : item('div', 'cover-version', `第${version}版`),
    item('div', 'cover-date', formatJapaneseDate(meta.date)),
    item('div', 'cover-company', meta.companyName),
    '</section>',
  ].join('');
}

/** The revision history table (design.md §7.2), or '' when there are no revisions. */
export function renderRevisions(revisions: readonly Revision[]): string {
  if (revisions.length === 0) return '';
  const rows = revisions.map(
    (revision) =>
      `<tr><td>${multiline(revision.version)}</td><td>${escapeHtml(formatJapaneseDate(revision.date))}</td><td>${multiline(revision.description)}</td><td>${multiline(revision.author)}</td></tr>`,
  );
  return [
    `<section class="doc-revisions" aria-label="${REVISIONS_TITLE}">`,
    `<h2>${REVISIONS_TITLE}</h2>`,
    '<table><thead><tr><th>版</th><th>日付</th><th>内容</th><th>担当</th></tr></thead>',
    `<tbody>${rows.join('')}</tbody></table>`,
    '</section>',
  ].join('');
}

/** The header with the logo (design.md §7.2), or '' without a logo. */
export function renderHeader({ logoDataUri }: HeaderFooterSettings): string {
  if (!logoDataUri) return '';
  return `<header class="doc-header"><img class="doc-logo" src="${escapeHtml(logoDataUri)}" alt="ロゴ"></header>`;
}

/** The footer with the copyright (design.md §7.2), or '' without one. */
export function renderFooter({ copyright }: HeaderFooterSettings): string {
  const text = copyright?.trim() ?? '';
  if (text === '') return '';
  return `<footer class="doc-footer"><span class="doc-copyright">${escapeHtml(text)}</span></footer>`;
}
