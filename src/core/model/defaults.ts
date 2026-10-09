import type { DocMeta, PageSettings } from './types';

/** Fallback page settings (design.md §10.1: A4 portrait, normal margin, 10.5pt). */
export const DEFAULT_PAGE_SETTINGS: Readonly<PageSettings> = Object.freeze({
  size: 'A4',
  orientation: 'portrait',
  margin: 'normal',
  baseFontPt: 10.5,
});

/** Local date as ISO "YYYY-MM-DD". */
export function toIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Empty cover information for a newly opened document (design.md §6). */
export function createDefaultMeta(today: Date): DocMeta {
  return { title: '', projectName: '', version: '', date: toIsoDate(today), companyName: '' };
}
