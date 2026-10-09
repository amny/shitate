import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildExportHtml } from '../../core/export';
import type { Theme } from '../../core/model';
import { createExtensions } from '../../editor/createEditor';
import { PDF_PREVIEW_PATH } from '../../pdf/api';
import type { PdfFrameWindow } from '../../pdf/api';
import { collectDocumentState } from '../documentState';
import { buildPdfRequest } from '../pdf/pdfRequest';
import { useDebouncedValue } from './useDebouncedValue';

/** design.md §8.4: the preview follows the CSS 0.4 s after typing stops. */
export const PREVIEW_DELAY_MS = 400;

type PreviewMode = 'screen' | 'pdf';

/** Shrinks the page to fit the narrow preview column (preview only, not part of the theme). */
const PREVIEW_ZOOM_STYLE = '<style>html { zoom: 0.55; }</style>';

interface ThemePreviewProps {
  editor: Editor;
  /** The theme being edited. */
  theme: Theme;
}

/** The current document shown with the theme being edited (design.md §8.4). */
export function ThemePreview({ editor, theme }: ThemePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('screen');
  const shown = useDebouncedValue(theme, PREVIEW_DELAY_MS);

  return (
    <aside className="theme-preview" aria-label="プレビュー">
      <div className="theme-preview-header">
        <span className="theme-preview-title">プレビュー</span>
        <div className="theme-editor-tabs is-small" role="tablist" aria-label="プレビューの種類">
          {(['screen', 'pdf'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className="theme-editor-tab"
              onClick={() => {
                setMode(m);
              }}
            >
              {m === 'screen' ? '画面' : 'PDF'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'screen' ? (
        <ScreenPreview editor={editor} theme={shown} />
      ) : (
        <PdfPreviewFrame editor={editor} theme={shown} />
      )}
    </aside>
  );
}

/** The exported HTML in an isolated frame: the theme cannot affect the app. */
function ScreenPreview({ editor, theme }: ThemePreviewProps) {
  const html = useMemo(
    () =>
      buildExportHtml(collectDocumentState(editor), theme, {
        extensions: createExtensions(),
      }).replace('</head>', `${PREVIEW_ZOOM_STYLE}</head>`),
    [editor, theme],
  );
  return (
    <iframe
      className="theme-preview-frame"
      title="テーマのプレビュー（画面）"
      sandbox=""
      srcDoc={html}
    />
  );
}

/** The PDF layout of the document with the theme (the PDF preview page of design.md §10). */
function PdfPreviewFrame({ editor, theme }: ThemePreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('組版しています…');

  useEffect(() => {
    const api = (frameRef.current?.contentWindow as PdfFrameWindow | null)?.shitatePdf;
    if (!ready || !api) return;
    setStatus('組版しています…');
    api.render(buildPdfRequest(editor, theme), (event) => {
      if (event.type === 'done') setStatus(`全 ${String(event.pageCount)} ページ`);
      if (event.type === 'error') setStatus(`組版できませんでした（${event.message}）`);
    });
  }, [editor, theme, ready]);

  return (
    <>
      <div className="theme-preview-status" role="status">
        {status}
      </div>
      <iframe
        ref={frameRef}
        className="theme-preview-frame"
        title="テーマのプレビュー（PDF）"
        src={PDF_PREVIEW_PATH}
        onLoad={() => {
          setReady(true);
        }}
      />
    </>
  );
}
