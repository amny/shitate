import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { useEffect } from 'react';
import { createExtensions, REQUEST_LINK_META } from './createEditor';

/** Creates the document editor. The editable root gets the theme class `.doc-body`. */
export function useDocEditor(): Editor {
  return useEditor({
    extensions: createExtensions(),
    editorProps: {
      attributes: {
        class: 'doc-body',
        'aria-label': '文書本文',
      },
    },
  });
}

/** Calls `onRequest` when the user presses Mod-k in the editor. */
export function useLinkRequest(editor: Editor, onRequest: () => void): void {
  useEffect(() => {
    const handler = ({ transaction }: { transaction: { getMeta: (key: string) => unknown } }) => {
      if (transaction.getMeta(REQUEST_LINK_META) === true) {
        onRequest();
      }
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor, onRequest]);
}
