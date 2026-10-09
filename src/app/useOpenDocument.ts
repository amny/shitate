import { closeHistory } from '@tiptap/pm/history';
import type { Editor, JSONContent } from '@tiptap/react';
import { getFileAdapter } from '../adapters';
import { IMPORT_ACCEPT, importFile } from '../core/import';
import { createExtensions } from '../editor/createEditor';
import type { Notice } from './notice';
import { useDocumentStore } from './store/documentStore';

export const DISCARD_CONFIRM_MESSAGE = '現在の内容を破棄して、選択したファイルを開きますか？';

/** Opens Markdown / HTML / JSON / exported HTML into the editor (design.md §6). */
export function useOpenDocument(
  editor: Editor,
  onNotice: (notice: Notice) => void,
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
    if (!editor.isEmpty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) {
      return;
    }

    // setContent goes through a transaction, so it can be undone and the
    // table heading guard (design.md §5.2) runs on the imported document.
    // closeHistory keeps it a separate undo step from typing just before.
    editor
      .chain()
      .command(({ tr }) => {
        closeHistory(tr);
        return true;
      })
      .setContent((result.kind === 'embedded' ? result.data.state.doc : result.doc) as JSONContent)
      .focus('start')
      .run();
    // Note: undo restores only the body, not the cover info below.
    if (result.kind === 'embedded') {
      useDocumentStore.getState().restore(result.data, file.name);
    } else {
      useDocumentStore.getState().resetForImportedBody(file.name);
    }
    const [warning] = result.warnings;
    if (warning) {
      onNotice({ kind: 'warning', message: warning });
    }
  };
}
