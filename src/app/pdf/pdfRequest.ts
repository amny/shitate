import type { Editor } from '@tiptap/react';
import { buildExportHtml, toExportFileName } from '../../core/export';
import { buildPageCss, PDF_BASE_CSS, resolvePageSettings } from '../../core/pdf';
import { createExtensions } from '../../editor/createEditor';
import type { Theme } from '../../core/model';
import type { PdfRenderRequest } from '../../pdf/api';
import { collectDocumentState } from '../documentState';
import { useDocumentStore } from '../store/documentStore';

declare global {
  interface Window {
    /** Development builds only: the last PDF render request, for E2E tests. */
    __shitatePdfRequest?: PdfRenderRequest;
  }
}

/** Title of the PDF (the print dialog suggests it as the file name). */
export function pdfTitle(): string {
  const { meta, fileName } = useDocumentStore.getState();
  return toExportFileName(fileName, meta.title).replace(/\.html$/, '');
}

/**
 * The exported HTML plus the PDF style sheets (design.md §10). `theme` defaults to the
 * document's theme; the theme editor passes the theme being edited.
 */
export function buildPdfRequest(
  editor: Editor,
  theme: Theme = useDocumentStore.getState().theme,
): PdfRenderRequest {
  const state = collectDocumentState(editor);
  const request: PdfRenderRequest = {
    html: buildExportHtml(state, theme, { extensions: createExtensions() }),
    styleSheets: [
      PDF_BASE_CSS,
      buildPageCss(resolvePageSettings(theme.settings, state.settingsOverride)),
    ],
    title: pdfTitle(),
  };
  if (import.meta.env.DEV) {
    window.__shitatePdfRequest = request;
  }
  return request;
}
