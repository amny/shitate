import { Fragment } from '@tiptap/pm/model';
import { Editor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import { createExtensions } from '../createEditor';
import { fitForTableCell, simplifyHtmlForTableCell } from './tableCellGuard';

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const paragraph = (value: string): JSONContent => ({ type: 'paragraph', content: [text(value)] });
const heading = (value: string): JSONContent => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [text(value)],
});

function tableWithCell(...cellContent: JSONContent[]): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: cellContent }] }],
      },
    ],
  };
}

function nodeTypes(json: JSONContent): string[] {
  return [json.type ?? '', ...(json.content ?? []).flatMap(nodeTypes)];
}

describe('table cell content (design.md §5.2)', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({ extensions: createExtensions() });
  });

  afterEach(() => {
    editor.destroy();
  });

  function isValidCellContent(cellType: string, blockType: string): boolean {
    const block = editor.schema.nodes[blockType]?.createAndFill();
    const cell = editor.schema.nodes[cellType];
    if (!block || !cell) {
      throw new Error(`Unknown node type: ${cellType} / ${blockType}`);
    }
    return cell.validContent(Fragment.from(block));
  }

  it.each(['tableCell', 'tableHeader'])('%s allows only the listed blocks', (name) => {
    const allowed = [
      'paragraph',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'image',
      'table',
    ];
    for (const block of allowed) {
      expect(isValidCellContent(name, block), block).toBe(true);
    }
    for (const block of ['heading', 'horizontalRule']) {
      expect(isValidCellContent(name, block), block).toBe(false);
    }
  });

  it('cannot turn a cell paragraph into a heading', () => {
    editor.commands.setContent(tableWithCell(paragraph('セル')));
    editor.commands.setTextSelection(4);
    expect(editor.isActive('tableCell')).toBe(true);
    expect(editor.can().setHeading({ level: 1 })).toBe(false);
  });

  it('converts headings nested in a cell (list item / blockquote) to paragraphs', () => {
    editor.commands.setContent(
      tableWithCell(
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('項目'), heading('リスト内の見出し')] },
          ],
        },
        { type: 'blockquote', content: [heading('引用内の見出し')] },
      ),
    );
    const json = editor.getJSON();
    expect(nodeTypes(json)).not.toContain('heading');
    expect(JSON.stringify(json)).toContain('リスト内の見出し');
    expect(JSON.stringify(json)).toContain('引用内の見出し');
  });

  it('converts headings in a nested table cell', () => {
    editor.commands.setContent(
      tableWithCell({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                content: [{ type: 'blockquote', content: [heading('入れ子の見出し')] }],
              },
            ],
          },
        ],
      }),
    );
    expect(nodeTypes(editor.getJSON())).not.toContain('heading');
  });

  it('keeps headings outside tables', () => {
    editor.commands.setContent({ type: 'doc', content: [heading('本文の見出し')] });
    expect(nodeTypes(editor.getJSON())).toContain('heading');
  });
});

describe('heading conversion helpers', () => {
  it('rewrites heading tags in clipboard HTML', () => {
    expect(
      simplifyHtmlForTableCell('<h2 id="a">見出し<b>太字</b></h2><ul><li><h3>項目</h3></li></ul>'),
    ).toBe('<p>見出し<b>太字</b></p><ul><li><p>項目</p></li></ul>');
  });

  it('replaces nested heading nodes in a fragment', () => {
    const editor = new Editor({ extensions: createExtensions() });
    const { schema } = editor;
    const fragment = schema.nodeFromJSON({
      type: 'doc',
      content: [heading('見出し'), { type: 'blockquote', content: [heading('引用内')] }],
    }).content;
    const result = fitForTableCell(fragment, schema);
    expect(result.toJSON()).toEqual([
      paragraph('見出し'),
      { type: 'blockquote', content: [paragraph('引用内')] },
    ]);
    editor.destroy();
  });
});
