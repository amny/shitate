/**
 * Adjusts the exported HTML for paged output only (the delivered HTML stays as exported):
 * a space after each heading number, so the running head taken with
 * `string-set: … content(text)` reads "1 はじめに" instead of "1はじめに" (S-1).
 */
export function prepareHtmlForPdf(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const number of document.querySelectorAll('.doc-body .heading-number')) {
    number.after(document.createTextNode(' '));
  }
  return `<!doctype html>\n${document.documentElement.outerHTML}`;
}

/** All text of the document, to load the font subsets it needs before layout. */
export function documentText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return document.body.textContent;
}
