// S-1 harness: renders sample.html with ?engine=vivliostyle|pagedjs and ?size=a4|a3l|custom.
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';

const params = new URLSearchParams(location.search);
const engine = params.get('engine') ?? 'vivliostyle';
const sizeKey = params.get('size') ?? 'a4';
const status = document.getElementById('status');
const viewport = document.getElementById('viewport');

// Prototype of buildPageCss (design.md §10.1).
const SIZES = {
  a4: { page: 'A4 portrait', landscape: 'A4 landscape' },
  a3l: { page: 'A3 landscape', landscape: 'A3 landscape' },
  custom: { page: '182mm 257mm', landscape: '257mm 182mm' },
};
const size = SIZES[sizeKey] ?? SIZES.a4;
const pageCss = `
@page { size: ${size.page}; margin: 20mm 18mm; }
@page landscape { size: ${size.landscape}; }
:root { --base-font-size: 10.5pt; }
`;

function done(info) {
  window.__result = { engine, size: sizeKey, ...info };
  status.textContent = `done: ${JSON.stringify(window.__result)}`;
  status.dataset.done = 'true';
}

function fail(error) {
  console.error(error);
  window.__result = { engine, size: sizeKey, error: String(error) };
  status.textContent = `error: ${String(error)}`;
  status.dataset.done = 'true';
}

/**
 * Vivliostyle prints every page with one @page size (the max width x max height), so mixed
 * portrait / landscape pages become square. Assign a named page per actual page size instead.
 * Enabled unless ?fixPrint=0.
 */
function fixVivliostylePrintSizes() {
  const PX_TO_PT = 72 / 96;
  const names = new Map();
  for (const container of viewport.querySelectorAll('[data-vivliostyle-page-container]')) {
    const width = Math.round(parseFloat(container.style.width) * PX_TO_PT * 100) / 100;
    const height = Math.round(parseFloat(container.style.height) * PX_TO_PT * 100) / 100;
    const key = `${width}x${height}`;
    if (!names.has(key)) names.set(key, { name: `viv-size-${names.size}`, width, height });
    container.style.setProperty('page', names.get(key).name);
  }
  // Keep Vivliostyle's own @page margin: with pixel ratio emulation the page boxes are
  // scaled up and the negative margin stops them from spilling onto extra sheets.
  const ownRule = [...document.querySelectorAll('style')]
    .map((s) => /@page\s*\{[^}]*margin:\s*([^;}]+)/.exec(s.textContent ?? ''))
    .find(Boolean);
  const margin = ownRule ? ownRule[1] : '0';
  const style = document.createElement('style');
  style.id = 'print-page-sizes';
  style.textContent = [...names.values()]
    .map(({ name, width, height }) => `@page ${name} { size: ${width}pt ${height}pt; margin: ${margin}; }`)
    .join('\n');
  document.head.append(style);
  return [...names.keys()];
}

async function renderVivliostyle() {
  const { CoreViewer, ReadyState } = await import('@vivliostyle/core');
  const started = performance.now();
  const viewer = new CoreViewer(
    { viewportElement: viewport },
    { renderAllPages: true, pageViewMode: 'singlePage', zoom: 1, autoResize: false },
  );
  viewer.addListener('error', (payload) => console.error('vivliostyle error', payload));
  // Vivliostyle shows one page at a time: lets the check script show page `index` (0-based).
  window.__showPage = async (index) => {
    viewer.navigateToPage('epage', index);
    for (let i = 0; i < 100; i++) {
      const shown = [...viewport.querySelectorAll('[data-vivliostyle-page-container]')].find(
        (c) => c.offsetParent !== null && c.getAttribute('data-vivliostyle-page-index') === String(index),
      );
      if (shown) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`page ${index} was not shown`);
  };
  viewer.addListener('readystatechange', () => {
    if (viewer.readyState === ReadyState.COMPLETE) {
      const pages = viewport.querySelectorAll('[data-vivliostyle-page-container]');
      const printSizes = params.get('fixPrint') === '0' ? null : fixVivliostylePrintSizes();
      done({ pages: pages.length, ms: Math.round(performance.now() - started), printSizes });
    }
  });
  // ?source=blob: pass the HTML as a string (like buildExportHtml output) through a Blob URL,
  // with the PDF stylesheet given as text instead of a relative <link>.
  let url = new URL('./sample.html', location.href).href;
  const authorStyleSheet = [{ text: pageCss }];
  if (params.get('source') === 'blob') {
    const [html, printCss] = await Promise.all([
      fetch('./sample.html').then((r) => r.text()),
      fetch('./print.css').then((r) => r.text()),
    ]);
    const withoutLink = html.replace('<link rel="stylesheet" href="./print.css">', '');
    url = URL.createObjectURL(new Blob([withoutLink], { type: 'text/html' }));
    authorStyleSheet.unshift({ text: printCss });
  }
  viewer.loadDocument({ url }, { authorStyleSheet });
}

async function renderPagedjs() {
  const { Previewer } = engine === 'pagedjs-beta' ? await import('pagedjs-beta') : await import('pagedjs');
  const started = performance.now();
  const html = await (await fetch('./sample.html')).text();
  const source = new DOMParser().parseFromString(html, 'text/html');
  const stylesheets = [...source.querySelectorAll('style')].map((style, i) => ({
    [`${location.origin}/inline-${i}.css`]: style.textContent,
  }));
  stylesheets.push(new URL('./print.css', location.href).href);
  stylesheets.push({ [`${location.origin}/page-settings.css`]: pageCss });
  const content = document.createDocumentFragment();
  content.append(...source.body.childNodes);
  const previewer = new Previewer();
  const flow = await previewer.preview(content, stylesheets, viewport);
  done({ pages: flow.total, ms: Math.round(performance.now() - started) });
}

(engine.startsWith('pagedjs') ? renderPagedjs() : renderVivliostyle()).catch(fail);
