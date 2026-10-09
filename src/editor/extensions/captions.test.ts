import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from '../createEditor';
import { getLabels } from './labels';

const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const text = (value: string): JSONContent => ({ type: 'text', text: value });
const p = (value?: string): JSONContent =>
  value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' };
const image: JSONContent = { type: 'image', attrs: { src: IMG } };
const table = (cell: JSONContent[] = [p('セル')]): JSONContent => ({
  type: 'table',
  content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: cell }] }],
});
const figure = (caption: string): JSONContent => ({
  type: 'figure',
  content: [image, { type: 'figcaption', content: [text(caption)] }],
});
const tableFigure = (caption: string): JSONContent => ({
  type: 'tableFigure',
  content: [{ type: 'tableCaption', content: [text(caption)] }, table()],
});

/** Top-level node types, without the empty paragraph StarterKit keeps at the end. */
function types(editor: Editor): string[] {
  const nodes = editor.getJSON().content;
  const last = nodes.at(-1);
  const trimmed = last?.type === 'paragraph' && !last.content ? nodes.slice(0, -1) : nodes;
  return trimmed.map((node) => node.type);
}

/** Position of the first node of the type. */
function posOf(editor: Editor, type: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.type.name === type) found = pos;
    return found < 0;
  });
  if (found < 0) throw new Error(`No ${type} in the document`);
  return found;
}

describe('captions', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('adds a caption to an image and puts the cursor in it', () => {
    editor.commands.setContent({ type: 'doc', content: [p('本文'), image] });
    editor.chain().setNodeSelection(posOf(editor, 'image')).toggleCaption().run();
    editor.commands.insertContent('構成図');
    expect(editor.getJSON().content[1]).toMatchObject({
      type: 'figure',
      content: [{ type: 'image' }, { type: 'figcaption', content: [{ text: '構成図' }] }],
    });
  });

  it('removes a figure caption and keeps its text as a paragraph', () => {
    editor.commands.setContent({ type: 'doc', content: [figure('構成図')] });
    editor
      .chain()
      .setTextSelection(posOf(editor, 'figcaption') + 1)
      .toggleCaption()
      .run();
    expect(types(editor)).toEqual(['image', 'paragraph']);
    expect(editor.getJSON().content[1]).toMatchObject({ content: [{ text: '構成図' }] });
  });

  it('removes an empty figure caption without leaving a paragraph', () => {
    editor.commands.setContent({ type: 'doc', content: [p('本文'), image] });
    editor.chain().setNodeSelection(posOf(editor, 'image')).toggleCaption().run();
    editor.chain().toggleCaption().run();
    expect(types(editor)).toEqual(['paragraph', 'image']);
  });

  it('adds a caption above a table and removes it again', () => {
    editor.commands.setContent({ type: 'doc', content: [table()] });
    editor
      .chain()
      .setTextSelection(posOf(editor, 'tableCell') + 2)
      .toggleCaption()
      .run();
    editor.commands.insertContent('画面一覧');
    expect(types(editor)).toEqual(['tableFigure']);
    expect(editor.getJSON().content[0]?.content?.[0]).toMatchObject({
      type: 'tableCaption',
      content: [{ text: '画面一覧' }],
    });

    editor
      .chain()
      .setTextSelection(posOf(editor, 'tableCell') + 2)
      .toggleCaption()
      .run();
    expect(types(editor)).toEqual(['paragraph', 'table']);
  });

  it('cannot caption images or tables inside table cells', () => {
    editor.commands.setContent({ type: 'doc', content: [table([p('a'), image, table()])] });
    editor.commands.setNodeSelection(posOf(editor, 'image'));
    expect(editor.can().toggleCaption()).toBe(false);
    // Cursor in the nested table.
    let nestedCell = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'tableCell') nestedCell = pos;
    });
    editor.commands.setTextSelection(nestedCell + 2);
    expect(editor.can().toggleCaption()).toBe(false);
  });

  it('deletes a captioned table together with its caption', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [p('前'), tableFigure('画面一覧'), p('後')],
    });
    editor
      .chain()
      .setTextSelection(posOf(editor, 'tableCell') + 2)
      .deleteTableWithCaption()
      .run();
    expect(types(editor)).toEqual(['paragraph', 'paragraph']);
  });

  it('numbers figures and tables through the document', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [figure('a'), tableFigure('b'), figure('c'), tableFigure('d')],
    });
    const labels = getLabels(editor.state);
    expect([...labels.figures.values()]).toEqual([
      { number: 1, caption: 'a' },
      { number: 2, caption: 'c' },
    ]);
    expect([...labels.tables.values()]).toEqual([
      { number: 1, caption: 'b' },
      { number: 2, caption: 'd' },
    ]);
    // Removing the first figure renumbers the rest.
    editor.commands.deleteRange({ from: 0, to: editor.state.doc.child(0).nodeSize });
    expect([...getLabels(editor.state).figures.values()]).toEqual([{ number: 1, caption: 'c' }]);
  });

  it('turns figures and captioned tables that end up in a cell into plain blocks', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [
        table([{ type: 'blockquote', content: [figure('セル内の図'), tableFigure('セル内の表')] }]),
      ],
    });
    const json = JSON.stringify(editor.getJSON());
    expect(json).not.toMatch(/"figure"|"tableFigure"|"figcaption"|"tableCaption"/);
    expect(json).toContain('セル内の図');
    expect(json).toContain('セル内の表');
    expect(getLabels(editor.state).figures.size).toBe(0);
  });

  it('replaces a figure whose image is deleted by its caption text', () => {
    editor.commands.setContent({ type: 'doc', content: [p('前'), figure('図の説明'), p('後')] });
    editor.chain().setNodeSelection(posOf(editor, 'image')).deleteSelection().run();
    expect(types(editor)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(editor.getText()).toContain('図の説明');
    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"');
  });

  it('removes a figure with an empty caption when its image is deleted', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [p('前'), { type: 'figure', content: [image, { type: 'figcaption' }] }, p('後')],
    });
    editor.chain().setNodeSelection(posOf(editor, 'image')).deleteSelection().run();
    expect(types(editor)).toEqual(['paragraph', 'paragraph']);
  });
});
