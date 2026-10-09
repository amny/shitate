import { Editor, generateJSON } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { createExtensions } from '../createEditor';

const heading = (level: number, text: string, id: string): JSONContent => ({
  type: 'heading',
  attrs: { level, id },
  content: [{ type: 'text', text }],
});
const ref = (targetId: string): JSONContent => ({ type: 'crossRef', attrs: { targetId } });
const para = (...content: JSONContent[]): JSONContent => ({ type: 'paragraph', content });

function refLabels(editor: Editor): { label: string | null; broken: boolean }[] {
  return [...editor.view.dom.querySelectorAll('.xref')].map((element) => ({
    label: element.getAttribute('data-label'),
    broken: element.classList.contains('is-broken'),
  }));
}

describe('crossRef', () => {
  const extensions = createExtensions();
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
    editor.commands.setContent({
      type: 'doc',
      content: [
        heading(1, '概要', 'h-target01'),
        heading(2, '目的', 'h-target02'),
        para({ type: 'text', text: '詳細は' }, ref('h-target02'), {
          type: 'text',
          text: 'を参照。',
        }),
      ],
    });
  });

  afterEach(() => {
    editor.destroy();
  });

  it('parses the editor form and the exported link form', () => {
    const json = generateJSON(
      '<p><span class="xref" data-target-id="h-aaaaaaaa"></span><a class="xref" href="#f-bbbbbbbb">図1</a><a href="https://example.com/">外部</a></p>',
      extensions,
    ) as JSONContent;
    const inline = json.content?.[0]?.content ?? [];
    expect(
      inline.map((n) => {
        const value: unknown = n.attrs?.['targetId'] ?? n.text;
        return [n.type, value];
      }),
    ).toEqual([
      ['crossRef', 'h-aaaaaaaa'],
      ['crossRef', 'f-bbbbbbbb'],
      ['text', '外部'],
    ]);
  });

  it('renders as an empty span with the target id and no text', () => {
    expect(editor.getHTML()).toContain('<span class="xref" data-target-id="h-target02"></span>');
    expect(editor.getText()).toContain('詳細はを参照。');
  });

  it('shows the resolved label and follows the target number', () => {
    expect(refLabels(editor)).toEqual([{ label: '1.1節', broken: false }]);
    editor.commands.insertContentAt(0, heading(1, '序文', 'h-target00'));
    expect(refLabels(editor)).toEqual([{ label: '2.1節', broken: false }]);
  });

  it('shows 参照先なし when the target is deleted', () => {
    const start = editor.state.doc.child(0).nodeSize;
    editor.commands.deleteRange({ from: start, to: start + editor.state.doc.child(1).nodeSize });
    expect(refLabels(editor)).toEqual([{ label: '参照先なし', broken: true }]);
  });

  it('inserts a reference with insertCrossRef', () => {
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.insertCrossRef('h-target01');
    expect(refLabels(editor).map((r) => r.label)).toEqual(['1.1節', '1節']);
  });
});
