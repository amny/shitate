import { Editor, generateJSON } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { isValidStableId } from '../../core/labels';
import { createExtensions } from '../createEditor';

const heading = (text: string, id?: string, level = 2): JSONContent => ({
  type: 'heading',
  attrs: { level, ...(id === undefined ? {} : { id }) },
  content: [{ type: 'text', text }],
});

function headings(editor: Editor): { text: string; id: unknown }[] {
  const result: { text: string; id: unknown }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      result.push({ text: node.textContent, id: node.attrs['id'] });
    }
  });
  return result;
}

/** Position of the n-th heading (0-based). */
function headingPos(editor: Editor, index: number): number {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') positions.push(pos);
  });
  const pos = positions[index];
  if (pos === undefined) throw new Error(`No heading #${String(index)}`);
  return pos;
}

describe('stableId', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('gives unique ids to headings without one', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [heading('a'), heading('b'), heading('c')],
    });
    const ids = headings(editor).map((h) => h.id);
    for (const id of ids) {
      expect(isValidStableId('heading', id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(3);
  });

  it('keeps valid ids and replaces ids of another form', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [
        heading('kept', 'h-keep0001'),
        heading('external', 'intro'),
        heading('doc', 'doc-data'),
      ],
    });
    const [kept, external, doc] = headings(editor);
    expect(kept?.id).toBe('h-keep0001');
    expect(isValidStableId('heading', external?.id)).toBe(true);
    expect(isValidStableId('heading', doc?.id)).toBe(true);
  });

  it('does not change ids while editing the heading', () => {
    editor.commands.setContent({ type: 'doc', content: [heading('見出し', 'h-edit0001')] });
    editor.commands.setTextSelection(3);
    editor.commands.insertContent('追加');
    editor.commands.setNode('heading', { level: 3 });
    expect(headings(editor)).toEqual([{ text: '見出追加し', id: 'h-edit0001' }]);
  });

  it('renames a copy pasted after the original', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [heading('original', 'h-orig0001'), { type: 'paragraph' }],
    });
    editor.commands.insertContentAt(editor.state.doc.content.size, heading('copy', 'h-orig0001'));
    const [original, copy] = headings(editor);
    expect(original).toEqual({ text: 'original', id: 'h-orig0001' });
    expect(copy?.id).not.toBe('h-orig0001');
    expect(isValidStableId('heading', copy?.id)).toBe(true);
  });

  it('keeps the original id when the copy is pasted before it', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'paragraph' }, heading('original', 'h-orig0001')],
    });
    editor.commands.insertContentAt(0, heading('copy', 'h-orig0001'));
    const all = headings(editor);
    expect(all.map((h) => h.text)).toEqual(['copy', 'original']);
    expect(all[1]?.id).toBe('h-orig0001');
    expect(all[0]?.id).not.toBe('h-orig0001');
  });

  it('keeps the original id when a copy replaces the text right before it', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [heading('前', 'h-prev0001'), heading('original', 'h-orig0001')],
    });
    // Replace the first heading with a copy of the second (same id).
    const from = headingPos(editor, 0);
    const to = from + (editor.state.doc.nodeAt(from)?.nodeSize ?? 0);
    editor.commands.insertContentAt({ from, to }, heading('copy', 'h-orig0001'));
    const all = headings(editor);
    expect(all.find((h) => h.text === 'original')?.id).toBe('h-orig0001');
    expect(all.find((h) => h.text === 'copy')?.id).not.toBe('h-orig0001');
  });

  it('keeps the first occurrence when a loaded document has duplicates', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [heading('first', 'h-dup00001'), heading('second', 'h-dup00001')],
    });
    const [first, second] = headings(editor);
    expect(first?.id).toBe('h-dup00001');
    expect(second?.id).not.toBe('h-dup00001');
  });

  it('renders the id in HTML', () => {
    editor.commands.setContent({ type: 'doc', content: [heading('a', 'h-render01')] });
    expect(editor.getHTML()).toContain('<h2 id="h-render01">');
  });
});

describe('numbered heading attribute', () => {
  const extensions = createExtensions();

  it('defaults to true and is not rendered', () => {
    const json = generateJSON('<h2>見出し</h2>', extensions);
    expect(json).toMatchObject({ content: [{ attrs: { numbered: true } }] });
  });

  it('round trips numbered=false through HTML', () => {
    const editor = new Editor({ extensions });
    editor.commands.setContent({
      type: 'doc',
      content: [{ ...heading('付録'), attrs: { level: 1, numbered: false } }],
    });
    const html = editor.getHTML();
    expect(html).toContain('data-numbered="false"');
    const reparsed = generateJSON(html, extensions) as JSONContent;
    expect(reparsed.content?.[0]?.attrs?.['numbered']).toBe(false);
    editor.destroy();
  });
});
