import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from '../createEditor';
import { findTableFigure } from './tableFigure';

const cell = (text: string): JSONContent => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const table = (text: string): JSONContent => ({
  type: 'table',
  content: [{ type: 'tableRow', content: [cell(text)] }],
});

describe('toggleTableLandscape', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'tableFigure',
          content: [
            { type: 'tableCaption', content: [{ type: 'text', text: '一覧' }] },
            table('captioned'),
          ],
        },
        table('plain'),
      ],
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  /** Puts the cursor into the cell that says `text`. */
  function cursorIn(text: string): void {
    let target = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.text === text) target = pos;
    });
    editor.commands.setTextSelection(target);
  }

  it('toggles the landscape attribute of the captioned table', () => {
    cursorIn('captioned');
    expect(findTableFigure(editor.state)?.landscape).toBe(false);
    expect(editor.commands.toggleTableLandscape()).toBe(true);
    expect(editor.state.doc.firstChild?.attrs['landscape']).toBe(true);
    expect(editor.view.dom.querySelector('.table-figure.is-landscape')).not.toBeNull();

    editor.commands.toggleTableLandscape();
    expect(editor.state.doc.firstChild?.attrs['landscape']).toBe(false);
  });

  it('also works from the caption, and is undoable', () => {
    cursorIn('一覧');
    editor.commands.toggleTableLandscape();
    expect(findTableFigure(editor.state)?.landscape).toBe(true);
    editor.commands.undo();
    expect(findTableFigure(editor.state)?.landscape).toBe(false);
  });

  it('is not available for a table without a caption', () => {
    cursorIn('plain');
    expect(findTableFigure(editor.state)).toBeNull();
    expect(editor.can().toggleTableLandscape()).toBe(false);
  });
});
