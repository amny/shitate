import type { Editor } from '@tiptap/react';

declare global {
  interface Window {
    /** Development builds only: lets E2E tests call editor APIs such as getHTML(). */
    __shitateEditor?: Editor;
  }
}

export function exposeEditorForTests(editor: Editor): () => void {
  if (!import.meta.env.DEV) {
    return () => undefined;
  }
  window.__shitateEditor = editor;
  return () => {
    if (window.__shitateEditor === editor) {
      delete window.__shitateEditor;
    }
  };
}
