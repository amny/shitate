import type { TocEntry } from '../labels';
import type { DocRoot, DocumentState, ThemeSettings } from '../model';
import { escapeHtml } from './escape';

export type TocDepth = ThemeSettings['tocDepth'];

/** Title shown at the top of the table of contents. */
export const TOC_TITLE = '目次';

/** The entries shown for the depth (H6 is never listed: the depth is at most 5). */
export function tocEntriesUpTo(entries: readonly TocEntry[], depth: TocDepth): TocEntry[] {
  return entries.filter((entry) => entry.level <= depth);
}

/**
 * Inner HTML of `nav.doc-toc` (design.md §7.2). Shared by the editor's TOC node view and the
 * export so both show the same markup. No lists or paragraphs: in the editor the TOC sits
 * inside `.doc-body`, where the theme's body rules for those elements would apply.
 */
export function renderTocContent(entries: readonly TocEntry[], depth: TocDepth): string {
  const items = tocEntriesUpTo(entries, depth).map((entry) => {
    const number = entry.number
      ? `<span class="toc-number">${escapeHtml(entry.number)}</span>`
      : '';
    return `<a class="toc-item toc-level-${String(entry.level)}" href="#${escapeHtml(entry.id)}">${number}${escapeHtml(entry.text)}</a>`;
  });
  return [`<div class="toc-title">${TOC_TITLE}</div>`, ...items].join('');
}

/** The full `nav.doc-toc` element for the export. */
export function renderTocNav(entries: readonly TocEntry[], depth: TocDepth): string {
  return `<nav class="doc-toc" aria-label="${TOC_TITLE}">${renderTocContent(entries, depth)}</nav>`;
}

/** Splits off the TOC node, which can only be the first node of the document (design.md §5.1). */
export function splitToc(doc: DocRoot): { hasToc: boolean; body: DocRoot } {
  const [first, ...rest] = doc.content ?? [];
  if (first?.type !== 'toc') {
    return { hasToc: false, body: doc };
  }
  return { hasToc: true, body: { ...doc, content: rest } };
}

/** The depth in effect: the document's override, else the theme's setting. */
export function resolveTocDepth(
  theme: ThemeSettings,
  override: DocumentState['settingsOverride'],
): TocDepth {
  return override?.tocDepth ?? theme.tocDepth;
}
