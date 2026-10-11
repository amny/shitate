import type { Editor, JSONContent } from '@tiptap/react';
import { getFileAdapter } from '../adapters';
import { IMPORT_ACCEPT, importFile } from '../core/import';
import { createExtensions } from '../editor/createEditor';
import type { DocumentSwitch } from './autosave/useAutosave';
import { replaceDocumentBody } from './documentState';
import type { Notice } from './notice';
import { useDocumentStore } from './store/documentStore';

/**
 * Opens Markdown / HTML / JSON / exported HTML into the editor (design.md §6).
 * The file becomes a new saved document; the current one stays in its own slot (design.md §9.2).
 */
export function useOpenDocument(
  editor: Editor,
  onNotice: (notice: Notice) => void,
  switchDocument: (next: DocumentSwitch) => Promise<boolean>,
): () => Promise<void> {
  return async () => {
    let file;
    try {
      file = await getFileAdapter().openFile(IMPORT_ACCEPT);
    } catch (error: unknown) {
      console.error('Failed to open file', error);
      onNotice({
        kind: 'error',
        message: `ファイルを開けませんでした。${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    if (!file) {
      return;
    }

    // Fresh, unflattened extensions: the editor's flattened list would duplicate
    // StarterKit's children when the schema is built again.
    const result = importFile(file, { extensions: createExtensions() });
    if (!result.ok) {
      onNotice({ kind: 'error', message: result.error });
      return;
    }
    const opened = await switchDocument({
      save: true,
      load: () => {
        replaceDocumentBody(
          editor,
          (result.kind === 'embedded' ? result.data.state.doc : result.doc) as JSONContent,
        );
        if (result.kind === 'embedded') {
          useDocumentStore.getState().restore(result.data, file.name);
        } else {
          useDocumentStore.getState().resetForImportedBody(file.name);
        }
      },
    });
    if (!opened) {
      return;
    }
    const [warning] = result.warnings;
    if (warning) {
      onNotice({ kind: 'warning', message: warning });
    }
  };
}
