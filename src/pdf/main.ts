import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/700.css';
import { CoreViewer, Navigation, PageViewMode, ReadyState } from '@vivliostyle/core';
import type { PdfFrameApi, PdfFrameEvent, PdfFrameWindow, PdfRenderRequest, PdfView } from './api';
import { documentText, prepareHtmlForPdf } from './prepareHtml';
import { fixPrintPageSizes } from './printSizes';

const viewportElement = document.getElementById('viewport');
if (!viewportElement) {
  throw new Error('pdf-preview.html has no #viewport element');
}
const viewport = viewportElement;

let viewer: CoreViewer | null = null;
let documentUrl: string | null = null;
let view: PdfView = { spread: false, fit: true };

function viewerOptions() {
  return {
    pageViewMode: view.spread ? PageViewMode.SPREAD : PageViewMode.SINGLE_PAGE,
    fitToScreen: view.fit,
    zoom: 1,
  };
}

/** Loads the Noto Sans JP subsets the document uses, so layout measures the final glyphs. */
async function loadFonts(text: string): Promise<void> {
  await Promise.all([
    document.fonts.load('400 16px "Noto Sans JP"', text),
    document.fonts.load('700 16px "Noto Sans JP"', text),
  ]);
}

async function render(
  request: PdfRenderRequest,
  onEvent: (event: PdfFrameEvent) => void,
): Promise<void> {
  const started = performance.now();
  document.title = request.title;
  await loadFonts(documentText(request.html));

  if (documentUrl) URL.revokeObjectURL(documentUrl);
  documentUrl = URL.createObjectURL(
    new Blob([prepareHtmlForPdf(request.html)], { type: 'text/html' }),
  );
  viewport.replaceChildren();
  const current = new CoreViewer(
    { viewportElement: viewport },
    { ...viewerOptions(), renderAllPages: true, autoResize: true },
  );
  viewer = current;

  let pageCount = 0;
  let done = false;
  current.addListener('error', (payload) => {
    const message = payload.content.error?.message ?? String(payload.content.messages);
    console.error('Vivliostyle error', payload.content);
    onEvent({ type: 'error', message });
  });
  current.addListener('paginationprogress', (payload) => {
    if (!done) onEvent({ type: 'progress', pages: payload.pages });
  });
  current.addListener('nav', (payload) => {
    if (done) onEvent({ type: 'page', index: payload.epage, pageCount });
  });
  // Links in the document (TOC entries, cross references) move to the target page.
  current.addListener('hyperlink', (payload) => {
    if (payload.internal) current.navigateToInternalUrl(payload.href);
  });
  current.addListener('readystatechange', () => {
    if (current.readyState !== ReadyState.COMPLETE || done) return;
    done = true;
    pageCount = viewport.querySelectorAll('[data-vivliostyle-page-container]').length;
    fixPrintPageSizes(document, viewport);
    onEvent({ type: 'done', pageCount, ms: Math.round(performance.now() - started) });
    onEvent({ type: 'page', index: 0, pageCount });
  });
  current.loadDocument(
    { url: documentUrl },
    { authorStyleSheet: request.styleSheets.map((text) => ({ text })) },
  );
}

const api: PdfFrameApi = {
  render: (request, onEvent) => {
    render(request, onEvent).catch((error: unknown) => {
      console.error('Failed to lay out the PDF', error);
      onEvent({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    });
  },
  showPage: (index) => {
    viewer?.navigateToPage(Navigation.EPAGE, index);
  },
  setView: (next) => {
    view = next;
    viewer?.setOptions(viewerOptions());
  },
  print: () => {
    window.print();
  },
};

(window as PdfFrameWindow).shitatePdf = api;
