// S-2 harness: renders DIAGRAMS with the planned config, sanitizes the SVG, and
// (?pdf=1) typesets an export-like HTML with Vivliostyle.
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import DOMPurify from 'dompurify';
import { DIAGRAMS } from './diagrams.js';

const params = new URLSearchParams(location.search);
const htmlLabels = params.get('htmlLabels') === '1';
const status = document.getElementById('status');
const viewport = document.getElementById('viewport');

const FONT = '"Noto Sans JP", sans-serif';

function done(info) {
  window.__result = info;
  status.textContent = 'done';
  status.dataset.done = 'true';
}

/**
 * Mermaid emits width="100%" with style="max-width: Npx". Give the SVG its natural size from
 * the viewBox instead, so that layout (and Vivliostyle's page breaking) sees the real height;
 * the theme scales it down with max-width: 100%.
 */
function fixSize(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) return svg;
  root.setAttribute('width', String(Math.ceil(box[2])));
  root.setAttribute('height', String(Math.ceil(box[3])));
  root.style.removeProperty('max-width');
  if (!root.getAttribute('style')) root.removeAttribute('style');
  return new XMLSerializer().serializeToString(root);
}

function countTags(svg) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const tags = {};
  for (const el of doc.querySelectorAll('*')) tags[el.localName] = (tags[el.localName] ?? 0) + 1;
  return tags;
}

async function main() {
  await document.fonts.load(`16px ${FONT}`, 'あ');
  const t0 = performance.now();
  const { default: mermaid } = await import('mermaid');
  const loadMs = performance.now() - t0;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'neutral',
    htmlLabels,
    fontFamily: FONT,
  });

  const results = {};
  const svgs = {};
  let n = 0;
  for (const [name, source] of Object.entries(DIAGRAMS)) {
    const id = `mermaid-${n++}`;
    const start = performance.now();
    try {
      const { svg } = await mermaid.render(id, source);
      const clean = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ['foreignObject'],
      });
      const raw = countTags(svg);
      const sanitized = countTags(clean);
      results[name] = {
        ms: Math.round(performance.now() - start),
        bytes: svg.length,
        sanitizedBytes: clean.length,
        foreignObject: raw.foreignObject ?? 0,
        text: raw.text ?? 0,
        styleKept: (sanitized.style ?? 0) === (raw.style ?? 0),
        lostTags: Object.keys(raw).filter((t) => !(t in sanitized)),
        hasExternalRef: /url\((?!#)|href="(?!#)|@import/.test(clean),
      };
      svgs[name] = params.get('fixSize') === '0' ? clean : fixSize(clean);
    } catch (error) {
      results[name] = { error: String(error).slice(0, 200) };
    }
    // mermaid leaves a temp element on failure
    document.getElementById(`d${id}`)?.remove();
  }

  if (params.get('pdf') !== '1') {
    viewport.innerHTML = Object.entries(svgs)
      .map(([k, v]) => `<h2>${k}</h2><div class="mermaid-diagram">${v}</div>`)
      .join('');
    done({ loadMs: Math.round(loadMs), htmlLabels, results });
    return;
  }

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
@page { size: 210mm 297mm; margin: 20mm 18mm; }
.doc { font-family: ${FONT}; font-size: 10.5pt; }
.mermaid-diagram { break-inside: avoid; text-align: center; margin: 1em 0; }
.mermaid-diagram svg { max-width: 100%; height: auto; }
</style></head><body><div class="doc"><main class="doc-body">
${Object.entries(svgs)
  .map(([k, v]) => `<h2>${k}</h2><div class="mermaid-diagram">${v}</div>`)
  .join('\n')}
</main></div></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const { CoreViewer } = await import('@vivliostyle/core');
  const viewer = new CoreViewer({ viewportElement: viewport }, { fitToScreen: false, pageViewMode: 'singlePage' });
  viewer.addListener('readystatechange', () => {
    if (viewer.readyState === 'complete') {
      const fixed = params.get('fixRefs') === '0' ? 0 : fixSvgRefs();
      done({ fixed, htmlLabels, results, pages: viewport.querySelectorAll('[data-vivliostyle-page-container]').length });
    }
  });
  viewer.addListener('error', (e) => console.error('vivliostyle', e));
  window.__viewer = viewer;
  viewer.loadDocument({ url });
}

/**
 * Vivliostyle rewrites url(#id) references to its own ids (viv-id-<doc url>:0023<id>) but
 * leaves the referenced SVG elements (markers, gradients) with their original id, so the
 * references break. Point them back at the original id.
 */
function fixSvgRefs() {
  let count = 0;
  const pattern = /url\(\s*["']?#viv-id-[^"')]*?:0023([^"')]+)["']?\s*\)/g;
  for (const el of viewport.querySelectorAll('[data-vivliostyle-page-container] svg *')) {
    for (const attr of [...el.attributes]) {
      if (!attr.value.includes('#viv-id-')) continue;
      el.setAttribute(attr.name, attr.value.replace(pattern, (_, id) => (count++, `url(#${id})`)));
    }
  }
  return count;
}

main().catch((error) => {
  console.error(error);
  done({ error: String(error) });
});
