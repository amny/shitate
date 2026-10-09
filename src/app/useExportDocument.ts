import type { Editor } from '@tiptap/react';
import { getFileAdapter } from '../adapters';
import { buildExportHtml, toExportFileName } from '../core/export';
import { createExtensions } from '../editor/createEditor';
import { collectDocumentState } from './documentState';
import type { Notice } from './notice';
import { useDocumentStore } from './store/documentStore';

/** Exports the delivery HTML with embedded editing data (design.md §7). */
export function useExportDocument(
  editor: Editor,
  onNotice: (notice: Notice) => void,
): () => Promise<void> {
  return async () => {
    try {
      const state = collectDocumentState(editor);
      const { theme, fileName } = useDocumentStore.getState();
      const html = buildExportHtml(state, theme, { extensions: createExtensions() });
      await getFileAdapter().saveFile(
        toExportFileName(fileName, state.meta.title),
        html,
        'text/html',
      );
    } catch (error: unknown) {
      console.error('Failed to export HTML', error);
      onNotice({
        kind: 'error',
        message: `HTMLをエクスポートできませんでした。${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
}
