import type { Editor } from '@tiptap/react';
import { getFileAdapter } from '../adapters';
import { buildExportHtml, toExportFileName } from '../core/export';
import { createExtensions } from '../editor/createEditor';
import { diagramFailureMessage, prepareDiagrams } from '../editor/mermaid';
import { collectDocumentState } from './documentState';
import type { Notice } from './notice';
import { useDocumentStore } from './store/documentStore';

/**
 * Exports the delivery HTML with embedded editing data (design.md §7). Mermaid diagrams that
 * cannot be rendered are exported as code, with a warning.
 */
export function useExportDocument(
  editor: Editor,
  onNotice: (notice: Notice) => void,
): () => Promise<void> {
  return async () => {
    try {
      const state = collectDocumentState(editor);
      const { theme, fileName } = useDocumentStore.getState();
      const { diagrams, failedCount } = await prepareDiagrams(state.doc);
      const html = buildExportHtml(state, theme, { extensions: createExtensions(), diagrams });
      await getFileAdapter().saveFile(
        toExportFileName(fileName, state.meta.title),
        html,
        'text/html',
      );
      const warning = diagramFailureMessage(failedCount);
      if (warning !== null) onNotice({ kind: 'warning', message: warning });
    } catch (error: unknown) {
      console.error('Failed to export HTML', error);
      onNotice({
        kind: 'error',
        message: `HTMLをエクスポートできませんでした。${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
}
