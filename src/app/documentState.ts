import type { Editor } from '@tiptap/react';
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
