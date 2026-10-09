import { documentText, prepareHtmlForPdf } from './prepareHtml';
import { fixPrintPageSizes } from './printSizes';

describe('prepareHtmlForPdf', () => {
  it('adds a space after heading numbers in the body only', () => {
    const html =
      '<!doctype html><html lang="ja"><head><title>t</title></head><body><div class="doc">' +
      '<nav class="doc-toc"><a class="toc-item"><span class="toc-number">1</span>概要</a></nav>' +
      '<main class="doc-body"><h1 id="h-1"><span class="heading-number">1</span>概要</h1></main>' +
      '</div></body></html>';
    const prepared = new DOMParser().parseFromString(prepareHtmlForPdf(html), 'text/html');
    expect(prepared.querySelector('h1')?.textContent).toBe('1 概要');
    expect(prepared.querySelector('.toc-item')?.textContent).toBe('1概要');
    expect(prepared.documentElement.lang).toBe('ja');
  });

  it('returns the body text for font loading', () => {
    expect(documentText('<p>本文</p><p>abc</p>')).toBe('本文abc');
  });
});

describe('fixPrintPageSizes', () => {
  it('gives each page container a named page per size, keeping the own @page margin', () => {
    document.head.innerHTML = '<style>@page { size: 1px 1px; margin: -5px; }</style>';
    const viewport = document.createElement('div');
    for (const [width, height] of [
      [96, 192],
      [192, 96],
      [96, 192],
    ]) {
      const container = document.createElement('div');
      container.setAttribute('data-vivliostyle-page-container', 'true');
      container.style.width = `${String(width)}px`;
      container.style.height = `${String(height)}px`;
      viewport.append(container);
    }

    const sizes = fixPrintPageSizes(document, viewport);
    expect(sizes).toEqual([
      { name: 'viv-size-0', widthPt: 72, heightPt: 144 },
      { name: 'viv-size-1', widthPt: 144, heightPt: 72 },
    ]);
    expect(
      [...viewport.children].map((c) => (c as HTMLElement).style.getPropertyValue('page')),
    ).toEqual(['viv-size-0', 'viv-size-1', 'viv-size-0']);
    expect(document.getElementById('print-page-sizes')?.textContent).toBe(
      '@page viv-size-0 { size: 72pt 144pt; margin: -5px; }\n' +
        '@page viv-size-1 { size: 144pt 72pt; margin: -5px; }',
    );

    // Running it again replaces the rules instead of adding more.
    fixPrintPageSizes(document, viewport);
    expect(document.querySelectorAll('#print-page-sizes')).toHaveLength(1);
  });
});
