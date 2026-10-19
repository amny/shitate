import { documentText, prepareHtmlForPdf } from './prepareHtml';
import { fixPrintPageSizes } from './printSizes';
import { fixSvgRefs } from './svgRefs';

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

describe('fixSvgRefs', () => {
  it('points the references Vivliostyle rewrote back at the original ids', () => {
    const viewport = document.createElement('div');
    viewport.innerHTML =
      '<div data-vivliostyle-page-container="true"><svg><defs><marker id="mermaid-1_arrow"></marker></defs>' +
      '<path marker-end="url(&quot;#viv-id-blob:http://localhost/a-b:0023mermaid-1_arrow&quot;)"></path>' +
      '<path marker-start="url(#viv-id-blob:x:0023mermaid-1_start)" fill="url(#local)"></path></svg></div>' +
      '<svg><path marker-end="url(#viv-id-x:0023outside)"></path></svg>';

    expect(fixSvgRefs(viewport)).toBe(2);
    const paths = viewport.querySelectorAll('path');
    expect(paths[0]?.getAttribute('marker-end')).toBe('url(#mermaid-1_arrow)');
    expect(paths[1]?.getAttribute('marker-start')).toBe('url(#mermaid-1_start)');
    expect(paths[1]?.getAttribute('fill')).toBe('url(#local)');
    // Only the laid out pages are touched.
    expect(paths[2]?.getAttribute('marker-end')).toBe('url(#viv-id-x:0023outside)');

    // Running it again (after another layout) finds nothing left to fix.
    expect(fixSvgRefs(viewport)).toBe(0);
  });
});
