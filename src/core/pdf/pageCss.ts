import type { DocumentState, PageSettings, ThemeSettings } from '../model';

/** Paper sizes in mm, portrait (B4 is JIS B4, as used in Japan). */
const PAPER_MM: Readonly<Record<Exclude<PageSettings['size'], 'custom'>, [number, number]>> = {
  A4: [210, 297],
  A3: [297, 420],
  B4: [257, 364],
};

/** Margin presets (design.md §10.1). */
export const PAGE_MARGINS: Readonly<Record<PageSettings['margin'], string>> = {
  narrow: '12mm',
  normal: '20mm 18mm',
  wide: '25mm',
};

/** Page settings in effect: the document's override, else the theme's (which always has one). */
export function resolvePageSettings(
  theme: ThemeSettings,
  override: DocumentState['settingsOverride'],
): PageSettings {
  return override?.page ?? theme.page;
}

/** Portrait width and height in mm. */
function paperMm(page: PageSettings): [number, number] {
  if (page.size === 'custom') {
    const { width, height } = page.customMm ?? { width: 210, height: 297 };
    return [Math.min(width, height), Math.max(width, height)];
  }
  return PAPER_MM[page.size];
}

function sizeValue([width, height]: [number, number]): string {
  return `${String(width)}mm ${String(height)}mm`;
}

/**
 * Page size, margin and base font size for the PDF (design.md §10.1). Written as plain values,
 * not CSS variables, because `@page { size }` does not resolve variables reliably.
 * The named page `landscape` holds tables marked as landscape.
 */
export function buildPageCss(page: PageSettings): string {
  const [short, long] = paperMm(page);
  const portrait: [number, number] = [short, long];
  const landscape: [number, number] = [long, short];
  const main = page.orientation === 'landscape' ? landscape : portrait;
  return [
    `@page { size: ${sizeValue(main)}; margin: ${PAGE_MARGINS[page.margin]}; }`,
    `@page landscape { size: ${sizeValue(landscape)}; }`,
    `.doc { --base-font-size: ${String(page.baseFontPt)}pt; }`,
    '.doc .doc-body .table-figure.is-landscape { page: landscape; }',
  ].join('\n');
}
