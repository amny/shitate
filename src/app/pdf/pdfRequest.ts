import type { Editor } from '@tiptap/react';
import { buildExportHtml, toExportFileName } from '../../core/export';
import { buildPageCss, PDF_BASE_CSS, resolvePageSettings } from '../../core/pdf';
import { createExtensions } from '../../editor/createEditor';
import { prepareDiagrams } from '../../editor/mermaid';
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
 * document's theme; the theme editor passes the theme being edited. Asynchronous because the
 * Mermaid diagrams are rendered first (§7); a diagram that cannot be rendered stays code.
 */
export async function buildPdfRequest(
  editor: Editor,
  theme: Theme = useDocumentStore.getState().theme,
): Promise<PdfRenderRequest> {
  const state = collectDocumentState(editor);
  const { diagrams } = await prepareDiagrams(state.doc);
  const request: PdfRenderRequest = {
    html: buildExportHtml(state, theme, {
      extensions: createExtensions(),
      imageViewer: false,
      diagrams,
    }),
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
