const PX_TO_PT = 72 / 96;

export interface PrintPageSize {
  name: string;
  widthPt: number;
  heightPt: number;
}

/**
 * Vivliostyle prints every page with one @page size (the largest width x height), so mixed
 * portrait / landscape pages would come out square. Gives each page container a named page
 * per actual size instead (design.md §10, docs/spike-pdf.md §3.2). Vivliostyle's own @page
 * margin is kept: with pixel ratio emulation the page boxes are scaled and the negative
 * margin stops them from spilling onto extra sheets.
 */
export function fixPrintPageSizes(document: Document, viewport: HTMLElement): PrintPageSize[] {
  const sizes = new Map<string, PrintPageSize>();
  for (const container of viewport.querySelectorAll<HTMLElement>(
    '[data-vivliostyle-page-container]',
  )) {
    const widthPt = Math.round(parseFloat(container.style.width) * PX_TO_PT * 100) / 100;
    const heightPt = Math.round(parseFloat(container.style.height) * PX_TO_PT * 100) / 100;
    const key = `${String(widthPt)}x${String(heightPt)}`;
    let size = sizes.get(key);
    if (!size) {
      size = { name: `viv-size-${String(sizes.size)}`, widthPt, heightPt };
      sizes.set(key, size);
    }
    container.style.setProperty('page', size.name);
  }

  const ownMargin = [...document.querySelectorAll('style')]
    .map((style) => /@page\s*\{[^}]*margin:\s*([^;}]+)/.exec(style.textContent)?.[1])
    .find((margin) => margin !== undefined);
  document.getElementById('print-page-sizes')?.remove();
  const style = document.createElement('style');
  style.id = 'print-page-sizes';
  style.textContent = [...sizes.values()]
    .map(
      ({ name, widthPt, heightPt }) =>
        `@page ${name} { size: ${String(widthPt)}pt ${String(heightPt)}pt; margin: ${ownMargin ?? '0'}; }`,
    )
    .join('\n');
  document.head.append(style);
  return [...sizes.values()];
}
