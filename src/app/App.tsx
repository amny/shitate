import { EditorContent } from '@tiptap/react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { exposeEditorForTests } from '../editor/devHook';
import { useDocEditor, useLinkRequest } from '../editor/useDocEditor';
import { CrossRefDialog } from '../editor/ui/CrossRefDialog';
import { LinkPopover } from '../editor/ui/LinkPopover';
import { TableMenu } from '../editor/ui/TableMenu';
import { AutosaveStatusView } from './autosave/AutosaveStatusView';
import { RestoreDraftBanner } from './autosave/RestoreDraftBanner';
import { useAutosave } from './autosave/useAutosave';
import { Toolbar } from './layout/Toolbar';
import { DocumentFooterPreview, DocumentPreface } from './DocumentPreface';
import { DocumentSettingsPanel } from './panels/DocumentSettingsPanel';
import { PdfPreview } from './pdf/PdfPreview';
import { useThemeStore } from './themes/themeStore';
import type { SettingsTab } from './panels/settingsTabs';
import { ThemeStyle } from './ThemeStyle';
import type { Notice } from './notice';
import { useExportDocument } from './useExportDocument';
import { useDocumentStore } from './store/documentStore';
import { useOpenDocument } from './useOpenDocument';
import { useTocDepth } from './useTocDepth';
import '../editor/editor-ui.css';

// The theme editor (with CodeMirror) is loaded only when it is opened.
const ThemeEditor = lazy(() =>
  import('./themes/ThemeEditor').then((module) => ({ default: module.ThemeEditor })),
);

export function App() {
  const editor = useDocEditor();
  const [linkOpen, setLinkOpen] = useState(false);
  const [crossRefOpen, setCrossRefOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('theme');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const fileName = useDocumentStore((state) => state.fileName);
  const open = useOpenDocument(editor, setNotice);
  const exportHtml = useExportDocument(editor, setNotice);
  const autosave = useAutosave(editor, setNotice);

  const openLink = useCallback(() => {
    setLinkOpen(true);
  }, []);
  useLinkRequest(editor, openLink);
  useEffect(() => exposeEditorForTests(editor), [editor]);

  // User themes for the theme picker (design.md §8.4).
  useEffect(() => {
    useThemeStore
      .getState()
      .loadUserThemes()
      .then(
        (invalid) => {
          if (invalid > 0) {
            setNotice({
              kind: 'warning',
              message: `保存されていたユーザーテーマのうち${String(invalid)}件を読み込めませんでした（形式が正しくありません）`,
            });
          }
        },
        (error: unknown) => {
          console.error('Failed to load user themes', error);
          setNotice({
            kind: 'error',
            message: `ユーザーテーマを読み込めませんでした（${error instanceof Error ? error.message : String(error)}）`,
          });
        },
      );
  }, []);
  const tocDepth = useTocDepth();
  useEffect(() => {
    editor.commands.setTocDepth(tocDepth);
  }, [editor, tocDepth]);

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-brand">Shitate</span>
        {fileName && (
          <>
            <span className="app-header-divider" aria-hidden="true" />
            <span className="app-file-name">{fileName}</span>
          </>
        )}
        <AutosaveStatusView status={autosave.status} />
        <span className="app-header-spacer" />
        <button
          type="button"
          className="app-header-button"
          onClick={() => {
            setNotice(null);
            void open();
          }}
        >
          開く
        </button>
        <button
          type="button"
          className="app-header-button"
          onClick={() => {
            setNotice(null);
            setPdfOpen(true);
          }}
        >
          PDFプレビュー
        </button>
        <button
          type="button"
          className="app-header-button is-primary"
          onClick={() => {
            setNotice(null);
            void exportHtml();
          }}
        >
          HTMLをエクスポート
        </button>
      </header>
      <div className="app-toolbar">
        <Toolbar
          editor={editor}
          onRequestLink={openLink}
          onRequestCrossRef={() => {
            setCrossRefOpen(true);
          }}
          onError={(message) => {
            setNotice({ kind: 'error', message });
          }}
        />
        {linkOpen && (
          <LinkPopover
            editor={editor}
            onClose={() => {
              setLinkOpen(false);
            }}
          />
        )}
      </div>
      {crossRefOpen && (
        <CrossRefDialog
          editor={editor}
          onClose={() => {
            setCrossRefOpen(false);
          }}
        />
      )}
      {autosave.pendingDraft && (
        <RestoreDraftBanner
          draft={autosave.pendingDraft}
          onRestore={autosave.restoreDraft}
          onDiscard={() => {
            void autosave.discardDraft();
          }}
        />
      )}
      {notice && (
        <div className={`app-notice is-${notice.kind}`} role="alert">
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
            }}
          >
            閉じる
          </button>
        </div>
      )}
      <div className="app-body">
        <main className="app-main" ref={mainRef}>
          <ThemeStyle />
          <div className="doc editor-paper">
            <DocumentPreface onEdit={setSettingsTab} />
            <EditorContent editor={editor} />
            <DocumentFooterPreview onEdit={setSettingsTab} />
          </div>
          <TableMenu editor={editor} container={() => mainRef.current ?? document.body} />
        </main>
        <DocumentSettingsPanel
          tab={settingsTab}
          onTabChange={setSettingsTab}
          onError={(message) => {
            setNotice({ kind: 'error', message });
          }}
          onEditTheme={() => {
            setThemeEditorOpen(true);
          }}
        />
      </div>
      {themeEditorOpen && (
        <Suspense fallback={<div className="theme-editor-loading">テーマ編集を開いています…</div>}>
          <ThemeEditor
            editor={editor}
            onClose={() => {
              setThemeEditorOpen(false);
            }}
          />
        </Suspense>
      )}
      {pdfOpen && (
        <PdfPreview
          editor={editor}
          onClose={() => {
            setPdfOpen(false);
          }}
        />
      )}
    </div>
  );
}
