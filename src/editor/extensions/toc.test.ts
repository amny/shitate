import { Editor, generateJSON, getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from '../createEditor';
import { findToc, getTocDepth, TOC_EMPTY_TEXT } from './toc';

const heading = (level: number, text: string, id: string): JSONContent => ({
  type: 'heading',
  attrs: { level, id },
  content: [{ type: 'text', text }],
});
const para = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

function tocItems(editor: Editor): string[] {
  return [...editor.view.dom.querySelectorAll('.doc-toc .toc-item')].map(
    (item) => item.textContent,
  );
}

describe('toc', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
    editor.commands.setContent({
      type: 'doc',
      content: [
        heading(1, '概要', 'h-toctest1'),
        heading(2, '目的', 'h-toctest2'),
        heading(3, '詳細', 'h-toctest3'),
        heading(4, '補足', 'h-toctest4'),
        para('本文'),
      ],
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('toggles a TOC at the start of the document', () => {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.toggleToc();
    expect(editor.state.doc.firstChild?.type.name).toBe('toc');
    expect(tocItems(editor)).toEqual(['1概要', '1.1目的', '1.1.1詳細']);

    editor.commands.toggleToc();
    expect(findToc(editor.state.doc)).toBeNull();
    expect(editor.view.dom.querySelector('.doc-toc')).toBeNull();
  });

  it('updates the entries when headings change', () => {
    editor.commands.toggleToc();
    const end = editor.state.doc.content.size;
    editor.commands.insertContentAt(end, heading(1, '設計', 'h-toctest5'));
    expect(tocItems(editor)).toEqual(['1概要', '1.1目的', '1.1.1詳細', '2設計']);

    // Turn off numbering of the first chapter: it and its sub-headings lose their numbers.
    editor.commands.setTextSelection(3);
    editor.commands.updateAttributes('heading', { numbered: false });
    expect(tocItems(editor)).toEqual(['概要', '目的', '詳細', '1設計']);
  });

  it('shows the depth set with setTocDepth, without changing the document or history', () => {
    editor.commands.toggleToc();
    const before = editor.getJSON();
    const undoDepth = editor.can().undo();

    editor.commands.setTocDepth(1);
    expect(getTocDepth(editor.state)).toBe(1);
    expect(tocItems(editor)).toEqual(['1概要']);
    editor.commands.setTocDepth(5);
    expect(tocItems(editor)).toEqual(['1概要', '1.1目的', '1.1.1詳細', '1.1.1.1補足']);

    expect(editor.getJSON()).toEqual(before);
    expect(editor.can().undo()).toBe(undoDepth);
    editor.commands.undo();
    expect(findToc(editor.state.doc)).toBeNull();
  });

  it('shows a placeholder when there are no headings', () => {
    editor.commands.setContent({ type: 'doc', content: [{ type: 'toc' }, para('本文')] });
    expect(tocItems(editor)).toEqual([]);
    expect(editor.view.dom.querySelector('.doc-toc .toc-placeholder')?.textContent).toBe(
      TOC_EMPTY_TEXT,
    );
  });

  it('allows the TOC only as the first node, once, and never in cells', () => {
    const schema = getSchema(createExtensions());
    const valid = (content: JSONContent[]) => {
      try {
        schema.nodeFromJSON({ type: 'doc', content }).check();
        return true;
      } catch {
        return false;
      }
    };
    expect(valid([{ type: 'toc' }, para('a')])).toBe(true);
    expect(valid([para('a'), { type: 'toc' }])).toBe(false);
    expect(valid([{ type: 'toc' }, { type: 'toc' }, para('a')])).toBe(false);
    expect(
      valid([
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'toc' }] }] },
          ],
        },
      ]),
    ).toBe(false);
    expect(valid([{ type: 'blockquote', content: [{ type: 'toc' }] }])).toBe(false);
  });

  it('drops a pasted TOC that is not at the start of the document', () => {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertContent('<nav class="doc-toc"></nav><p>貼り付け</p>');
    expect(findToc(editor.state.doc)).toBeNull();
    expect(editor.getText()).toContain('貼り付け');
  });

  it('parses nav.doc-toc as the TOC node', () => {
    const json = generateJSON(
      '<nav class="doc-toc"><div class="toc-title">目次</div><a class="toc-item" href="#h-x">1概要</a></nav><p>a</p>',
      createExtensions(),
    ) as JSONContent;
    expect(json.content?.[0]).toEqual({ type: 'toc' });
  });
});
