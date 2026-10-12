import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { buildExportHtml } from '../../core/export';
import type { Theme } from '../../core/model';
import {
  PREVIEW_MIN_WIDTH,
  clampPreviewWidth,
  previewWidthForKey,
  previewWidthRange,
  previewZoom,
} from '../../core/theme/previewLayout';
import type { WidthRange } from '../../core/theme/previewLayout';
import { createExtensions } from '../../editor/createEditor';
import { PDF_PREVIEW_PATH } from '../../pdf/api';
import type { PdfFrameWindow } from '../../pdf/api';
import { collectDocumentState } from '../documentState';
import { buildPdfRequest } from '../pdf/pdfRequest';
import { useDebouncedValue } from './useDebouncedValue';
import { useElementWidth } from './useElementWidth';

/** design.md §8.4: the preview follows the CSS 0.4 s after typing stops. */
export const PREVIEW_DELAY_MS = 400;

type PreviewMode = 'screen' | 'pdf';

interface PreviewFrameProps {
  editor: Editor;
  /** The theme being edited. */
  theme: Theme;
}

interface ThemePreviewProps extends PreviewFrameProps {
  /** The central editing area, which shares its width with the preview. */
  mainRef: RefObject<HTMLElement | null>;
}

interface Drag {
  pointerId: number;
  startX: number;
  startWidth: number;
  range: WidthRange;
}

/** The current document shown with the theme being edited (design.md §8.4). */
export function ThemePreview({ editor, theme, mainRef }: ThemePreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('screen');
  const shown = useDebouncedValue(theme, PREVIEW_DELAY_MS);
  // Kept only while the theme editor is open (design.md §8.4); null is the default width.
  const [width, setWidth] = useState<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const asideWidth = useElementWidth(asideRef);
  const mainWidth = useElementWidth(mainRef);

  /** The current width and the widths it can take, from the rendered layout. */
  const measure = () => {
    const aside = asideRef.current?.getBoundingClientRect().width;
    const main = mainRef.current?.getBoundingClientRect().width;
    if (aside === undefined || main === undefined) return null;
    return { width: aside, range: previewWidthRange(aside + main) };
  };

  const range =
    asideWidth !== null && mainWidth !== null ? previewWidthRange(asideWidth + mainWidth) : null;

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const current = measure();
    if (!current) return;
    event.preventDefault();
    // Captured so the drag keeps going over the preview frame.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: current.width,
      range: current.range,
    });
  };

  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag?.pointerId !== event.pointerId) return;
    // The separator is on the left edge: moving it left widens the preview.
    setWidth(clampPreviewWidth(drag.startWidth + drag.startX - event.clientX, drag.range));
  };

  const endDrag = () => {
    setDrag(null);
  };

  const resizeWithKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = measure();
    if (!current) return;
    const next = previewWidthForKey(event.key, current.width, current.range);
    if (next === null) return;
    event.preventDefault();
    setWidth(next);
  };

  return (
    <aside
      ref={asideRef}
      className={drag ? 'theme-preview is-resizing' : 'theme-preview'}
      aria-label="プレビュー"
      style={width === null ? undefined : { width: `${String(width)}px` }}
    >
      <div
        className="theme-preview-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="プレビューの幅"
        aria-valuenow={asideWidth === null ? undefined : Math.round(asideWidth)}
        aria-valuemin={PREVIEW_MIN_WIDTH}
        aria-valuemax={range?.max}
        tabIndex={0}
        title="ドラッグで幅を変更（ダブルクリックで元の幅に戻す）"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={resizeWithKey}
        onDoubleClick={() => {
          setWidth(null);
        }}
      />
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

/**
 * The exported HTML in an isolated frame: the theme cannot affect the app. The page is laid out
 * at PREVIEW_PAGE_WIDTH and scaled from outside the frame to fit (design.md §8.4), so resizing
 * does not reload it.
 */
function ScreenPreview({ editor, theme }: PreviewFrameProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useElementWidth(viewportRef);
  const zoom = viewportWidth === null ? null : previewZoom(viewportWidth);
  const html = useMemo(
    () =>
      buildExportHtml(collectDocumentState(editor), theme, {
        extensions: createExtensions(),
      }),
    [editor, theme],
  );
  return (
    <div ref={viewportRef} className="theme-preview-viewport">
      {zoom !== null && (
        <iframe
          className="theme-preview-scaled-frame"
          title="テーマのプレビュー（画面）"
          sandbox=""
          srcDoc={html}
          style={{
            width: `${String(100 / zoom)}%`,
            height: `${String(100 / zoom)}%`,
            transform: `scale(${String(zoom)})`,
          }}
        />
      )}
    </div>
  );
}

/** The PDF layout of the document with the theme (the PDF preview page of design.md §10). */
function PdfPreviewFrame({ editor, theme }: PreviewFrameProps) {
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
