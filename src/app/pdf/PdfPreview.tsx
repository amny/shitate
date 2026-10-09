import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { PDF_PREVIEW_PATH } from '../../pdf/api';
import type { PdfFrameApi, PdfFrameEvent, PdfFrameWindow, PdfView } from '../../pdf/api';
import { buildPdfRequest, pdfTitle } from './pdfRequest';

type Status =
  | { kind: 'loading'; pages: number }
  | { kind: 'done'; pageCount: number; page: number }
  | { kind: 'error'; message: string };

interface PdfPreviewProps {
  editor: Editor;
  onClose: () => void;
}

const VIEW_OPTIONS: readonly { id: string; label: string; view: PdfView }[] = [
  { id: 'single-fit', label: '1ページ（全体）', view: { spread: false, fit: true } },
  { id: 'spread-fit', label: '見開き（全体）', view: { spread: true, fit: true } },
  { id: 'single-100', label: '1ページ（100%）', view: { spread: false, fit: false } },
  { id: 'spread-100', label: '見開き（100%）', view: { spread: true, fit: false } },
];

/**
 * PDF preview screen (design: PdfPreview, design.md §10). The layout runs in an iframe so the
 * app's CSS does not reach it and printing prints only the pages.
 */
export function PdfPreview({ editor, onClose }: PdfPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [api, setApi] = useState<PdfFrameApi | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading', pages: 0 });
  const [viewId, setViewId] = useState('single-fit');
  const [title] = useState(pdfTitle);

  // Start the layout once the frame has loaded.
  const onFrameLoad = () => {
    const frameApi = (frameRef.current?.contentWindow as PdfFrameWindow | null)?.shitatePdf;
    if (!frameApi) {
      setStatus({ kind: 'error', message: 'PDFプレビューの画面を読み込めませんでした' });
      return;
    }
    setApi(frameApi);
    frameApi.render(buildPdfRequest(editor), (event: PdfFrameEvent) => {
      switch (event.type) {
        case 'progress':
          setStatus({ kind: 'loading', pages: event.pages });
          return;
        case 'done':
          console.info(`PDF layout: ${String(event.pageCount)} pages in ${String(event.ms)} ms`);
          setStatus({ kind: 'done', pageCount: event.pageCount, page: 0 });
          return;
        case 'page':
          setStatus({ kind: 'done', pageCount: event.pageCount, page: event.index });
          return;
        case 'error':
          setStatus({ kind: 'error', message: event.message });
          return;
      }
    });
  };

  const done = status.kind === 'done' ? status : null;
  const showPage = (index: number) => {
    if (!api || !done) return;
    api.showPage(Math.max(0, Math.min(done.pageCount - 1, index)));
  };

  // Arrow keys turn pages, also while the frame has the focus.
  useEffect(() => {
    if (!done || !api) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('select, input')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault();
        api.showPage(Math.min(done.pageCount - 1, done.page + 1));
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        api.showPage(Math.max(0, done.page - 1));
      }
    };
    const frameWindow = frameRef.current?.contentWindow;
    window.addEventListener('keydown', onKeyDown);
    frameWindow?.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      frameWindow?.removeEventListener('keydown', onKeyDown);
    };
  }, [api, done]);

  return (
    <div className="pdf-preview" role="dialog" aria-modal="true" aria-label="PDFプレビュー">
      <header className="app-header">
        <span className="app-brand">Shitate</span>
        <span className="app-header-divider" aria-hidden="true" />
        <button type="button" className="app-header-button" onClick={onClose}>
          ‹ 編集に戻る
        </button>
        <span className="pdf-preview-title">PDFプレビュー</span>
        <span className="pdf-preview-name">{title}</span>
        <span className="app-header-spacer" />
        {done && (
          <div className="pdf-preview-pager" role="group" aria-label="ページ送り">
            <button
              type="button"
              className="app-header-button"
              aria-label="前のページ"
              disabled={done.page === 0}
              onClick={() => {
                showPage(done.page - 1);
              }}
            >
              ‹
            </button>
            <span className="pdf-preview-page" aria-live="polite">
              {done.page + 1} / 全 {done.pageCount} ページ
            </span>
            <button
              type="button"
              className="app-header-button"
              aria-label="次のページ"
              disabled={done.page >= done.pageCount - 1}
              onClick={() => {
                showPage(done.page + 1);
              }}
            >
              ›
            </button>
          </div>
        )}
        <label className="pdf-preview-view">
          表示
          <select
            className="settings-select"
            value={viewId}
            onChange={(event) => {
              const option = VIEW_OPTIONS.find((o) => o.id === event.target.value);
              if (!option) return;
              setViewId(option.id);
              api?.setView(option.view);
            }}
          >
            {VIEW_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="app-header-button is-primary"
          disabled={!done}
          onClick={() => api?.print()}
        >
          印刷してPDFに保存
        </button>
      </header>
      <div className="pdf-preview-info" role="status">
        {status.kind === 'loading' &&
          (status.pages > 0
            ? `組版しています…（${String(status.pages)} ページ）`
            : '組版しています…')}
        {status.kind === 'done' &&
          'PDF用フォント（Noto Sans JP）で組版しています。印刷ダイアログで「送信先：PDFに保存」を選んでください。'}
        {status.kind === 'error' && `PDFを組版できませんでした（${status.message}）`}
      </div>
      <iframe
        ref={frameRef}
        className="pdf-preview-frame"
        title="PDFのページ"
        src={PDF_PREVIEW_PATH}
        onLoad={onFrameLoad}
      />
    </div>
  );
}
