/**
 * Contract between the app and the PDF preview frame (pdf-preview.html, design.md §10).
 * The frame is same-origin, so the app calls `window.shitatePdf` in it directly.
 */
export interface PdfRenderRequest {
  /** Output of buildExportHtml. */
  html: string;
  /** Author style sheets applied after the document's own (base rules, page settings). */
  styleSheets: string[];
  /** Document title for the print dialog (suggested PDF file name). */
  title: string;
}

export type PdfView = {
  /** Two pages side by side. */
  spread: boolean;
  /** Fit the page(s) into the frame; otherwise 100%. */
  fit: boolean;
};

export type PdfFrameEvent =
  | { type: 'progress'; pages: number }
  | { type: 'done'; pageCount: number; ms: number }
  /** The shown page changed (0-based). */
  | { type: 'page'; index: number; pageCount: number }
  | { type: 'error'; message: string };

export interface PdfFrameApi {
  /** Lays out the document; events report progress, completion and errors. */
  render: (request: PdfRenderRequest, onEvent: (event: PdfFrameEvent) => void) => void;
  showPage: (index: number) => void;
  setView: (view: PdfView) => void;
  print: () => void;
}

export type PdfFrameWindow = Window & { shitatePdf?: PdfFrameApi };

export const PDF_PREVIEW_PATH = '/pdf-preview.html';
