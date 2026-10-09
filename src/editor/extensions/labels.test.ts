import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from '../createEditor';
import { getLabels, labelsPluginKey } from './labels';

const heading = (
  level: number,
  text: string,
  attrs: Record<string, unknown> = {},
): JSONContent => ({
  type: 'heading',
  attrs: { level, ...attrs },
  content: [{ type: 'text', text }],
});

function tocNumbers(editor: Editor): string[] {
  return getLabels(editor.state).toc.map((entry) => `${entry.number}:${entry.text}`);
}

function widgetTexts(editor: Editor): string[] {
  const decorations = labelsPluginKey.getState(editor.state)?.decorations.find() ?? [];
  return decorations.map((decoration) => {
    const spec = decoration.spec as { key?: string };
    return spec.key?.split(':')[2] ?? '';
  });
}

describe('labels plugin', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
    editor.commands.setContent({
      type: 'doc',
      content: [heading(1, 'はじめに'), heading(2, '目的'), heading(2, '範囲'), heading(1, '設計')],
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('computes labels for the document', () => {
    expect(tocNumbers(editor)).toEqual(['1:はじめに', '1.1:目的', '1.2:範囲', '2:設計']);
    expect(widgetTexts(editor)).toEqual(['1', '1.1', '1.2', '2']);
  });

  it('updates when a heading is added', () => {
    editor.commands.insertContentAt(0, heading(1, '序文'));
    expect(tocNumbers(editor)).toEqual(['1:序文', '2:はじめに', '2.1:目的', '2.2:範囲', '3:設計']);
  });

  it('updates when a heading is deleted', () => {
    const second = editor.state.doc.child(0).nodeSize;
    editor.commands.deleteRange({ from: second, to: second + editor.state.doc.child(1).nodeSize });
    expect(tocNumbers(editor)).toEqual(['1:はじめに', '1.1:範囲', '2:設計']);
  });

  it('updates when a heading level changes', () => {
    const pos = editor.state.doc.child(0).nodeSize + 1;
    editor.chain().setTextSelection(pos).setNode('heading', { level: 1 }).run();
    expect(tocNumbers(editor)).toEqual(['1:はじめに', '2:目的', '2.1:範囲', '3:設計']);
  });

  it('skips headings with numbered=false', () => {
    editor.chain().setTextSelection(1).updateAttributes('heading', { numbered: false }).run();
    // Its sub-headings are not numbered either, so the next H1 is 1 (design.md §5.4).
    expect(tocNumbers(editor)).toEqual([':はじめに', ':目的', ':範囲', '1:設計']);
    expect(widgetTexts(editor)).toEqual(['1']);
  });

  it('never writes numbers into the document', () => {
    expect(editor.getText()).not.toMatch(/\d/);
    expect(JSON.stringify(editor.getJSON())).not.toContain('heading-number');
  });
});
