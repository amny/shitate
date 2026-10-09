import { css } from '@codemirror/lang-css';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';

interface CssEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name of the editing area. */
  label: string;
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: '#ffffff' },
  '.cm-scroller': {
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    lineHeight: '1.75',
  },
  '.cm-gutters': { backgroundColor: '#f7f5f1', borderRight: '1px solid #ece9e2' },
  '&.cm-focused': { outline: '2px solid #4346d8', outlineOffset: '-2px' },
});

/** CSS editor (CodeMirror 6, design.md §8.4). Controlled: external changes replace the text. */
export function CssEditor({ value, onChange, label }: CssEditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest callback without recreating the editor.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const view = new EditorView({
      doc: value,
      parent,
      extensions: [
        basicSetup,
        css(),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor is created once; later values are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply changes made outside the editor (reset, switching themes).
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={parentRef} className="css-editor" />;
}
