import { EditorState } from '@tiptap/pm/state';
import type { Editor, JSONContent } from '@tiptap/react';
import { createEmbeddedData } from '../core/export';
import { docRootSchema } from '../core/model';
import type { DocumentState, EmbeddedData } from '../core/model';
import { useDocumentStore } from './store/documentStore';

/** Current document state: the editor body plus the cover info held in the store. */
export function collectDocumentState(editor: Editor): DocumentState {
  const { meta, revisions, themeId, settingsOverride } = useDocumentStore.getState();
  const state: DocumentState = {
    doc: docRootSchema.parse(editor.getJSON()),
    meta,
    revisions,
    themeId,
  };
  return settingsOverride === undefined ? state : { ...state, settingsOverride };
}

/** Everything needed to restore the document (exported HTML / drafts). */
export function collectEmbeddedData(editor: Editor): EmbeddedData {
  return createEmbeddedData(collectDocumentState(editor), useDocumentStore.getState().theme);
}

/**
 * Replaces the body with another document and clears the undo history, so that undo never
 * brings the previous document's body into this one (task 1-7).
 * setContent goes through a transaction, so the table heading guard (design.md §5.2) runs
 * on the new body before the history is cleared.
 */
export function replaceDocumentBody(editor: Editor, doc: JSONContent): void {
  editor.commands.setContent(doc);
  const { state } = editor;
  editor.view.updateState(
    EditorState.create({ doc: state.doc, selection: state.selection, plugins: state.plugins }),
  );
  // A transaction after updateState lets the toolbar and NodeViews see the new state.
  editor.commands.focus('start');
}
