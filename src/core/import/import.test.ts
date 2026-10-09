import basicMd from '../../../fixtures/basic.md?raw';
import complexTableHtml from '../../../fixtures/complex-table.html?raw';
import specFullJson from '../../../fixtures/spec-full.json?raw';
import { createExtensions } from '../../editor/createEditor';
import type { DocNode, DocRoot } from '../model';
import { importFile } from './index';
import { sanitizeHtml } from './html';

const extensions = createExtensions();

function importOk(name: string, text: string): { doc: DocRoot; warnings: string[] } {
  const result = importFile({ name, text }, { extensions });
  if (!result.ok) {
    throw new Error(`Import failed: ${result.error}`);
  }
  if (result.kind !== 'document') {
    throw new Error(`Unexpected import kind: ${result.kind}`);
  }
  return result;
}

function importError(name: string, text: string): string {
  const result = importFile({ name, text }, { extensions });
  if (result.ok) {
    throw new Error('Import unexpectedly succeeded');
  }
  return result.error;
}

function all(nodes: readonly DocNode[] | undefined): DocNode[] {
  return (nodes ?? []).flatMap((node) => [node, ...all(node.content)]);
}

function ofType(root: DocRoot | DocNode, type: string): DocNode[] {
  return all(root.content).filter((node) => node.type === type);
}

function textOf(node: DocNode): string {
  return all(node.content)
    .map((n) => n.text ?? '')
    .join('');
}

function hasMark(root: DocRoot, mark: string): boolean {
  return all(root.content).some((node) => node.marks?.some((m) => m.type === mark));
}

describe('importFile: format detection', () => {
  it('rejects unsupported extensions', () => {
    expect(importError('spec.docx', '')).toContain('対応していないファイル形式です');
  });

  it('detects formats case-insensitively', () => {
    expect(ofType(importOk('A.MD', '# 見出し').doc, 'heading')).toHaveLength(1);
    expect(ofType(importOk('a.HTM', '<h2>見出し</h2>').doc, 'heading')).toHaveLength(1);
  });
});

describe('importFile: Markdown (fixtures/basic.md)', () => {
  const { doc, warnings } = importOk('basic.md', basicMd);

  it('reads headings and inline marks', () => {
    expect(ofType(doc, 'heading').map((h) => h.attrs?.['level'])).toEqual([1, 2, 3, 3, 2, 4, 2]);
    for (const mark of ['bold', 'italic', 'strike', 'code', 'link']) {
      expect(hasMark(doc, mark), mark).toBe(true);
    }
  });

  it('reads a GFM table with a header row', () => {
    const [table] = ofType(doc, 'table');
    expect(table).toBeDefined();
    if (!table) return;
    expect(ofType(table, 'tableRow')).toHaveLength(5);
    expect(ofType(table, 'tableHeader').map(textOf)).toEqual([
      '機能ID',
      '機能名',
      '優先度',
      '工数（人日）',
    ]);
    expect(ofType(table, 'tableCell').map(textOf)).toContain('履歴照会');
  });

  it('reads nested lists three levels deep', () => {
    const lists = ofType(doc, 'bulletList').concat(ofType(doc, 'orderedList'));
    const depth = (node: DocNode): number =>
      1 +
      Math.max(
        0,
        ...ofType(node, 'listItem').flatMap((li) =>
          (li.content ?? []).filter((c) => c.type.endsWith('List')).map(depth),
        ),
      );
    expect(Math.max(...lists.map(depth))).toBe(3);
    const ordered = ofType(doc, 'orderedList')[0];
    expect(ordered && ofType(ordered, 'bulletList').length).toBeGreaterThan(0);
  });

  it('reads code blocks with language, blockquotes, rules and images', () => {
    expect(ofType(doc, 'codeBlock')[0]?.attrs?.['language']).toBe('ts');
    expect(ofType(doc, 'blockquote')).toHaveLength(1);
    expect(ofType(doc, 'horizontalRule')).toHaveLength(1);
    expect(ofType(doc, 'image')[0]?.attrs?.['src']).toMatch(/^data:image\/png;base64,/);
    expect(warnings).toEqual([]);
  });
});

describe('importFile: external HTML (fixtures/complex-table.html)', () => {
  const { doc } = importOk('complex-table.html', complexTableHtml);
  const cells = ofType(doc, 'tableCell').concat(ofType(doc, 'tableHeader'));

  it('keeps merged cells', () => {
    expect(cells.filter((c) => c.attrs?.['rowspan'] === 2).length).toBe(2);
    expect(cells.some((c) => c.attrs?.['colspan'] === 3)).toBe(true);
    expect(cells.filter((c) => c.attrs?.['colspan'] === 2).length).toBe(2);
  });

  it('keeps lists, nested tables and images inside cells', () => {
    const childTypes = cells.flatMap((c) => (c.content ?? []).map((child) => child.type));
    expect(childTypes).toEqual(
      expect.arrayContaining(['bulletList', 'orderedList', 'table', 'image']),
    );
    const nested = cells.find((c) => c.content?.some((child) => child.type === 'table'));
    expect(nested && ofType(nested, 'tableCell').map(textOf)).toEqual(['1', '個人', '2', '法人']);
    for (const image of ofType(doc, 'image')) {
      expect(image.attrs?.['src']).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('keeps the surrounding headings and paragraphs', () => {
    expect(ofType(doc, 'heading').map(textOf)).toEqual(['画面設計書', '画面一覧', '入力項目']);
  });
});

describe('importFile: sanitization', () => {
  const dangerous = `
    <p onclick="alert(1)">本文</p>
    <script>alert('x')</script>
    <img src="x" onerror="alert(2)">
    <a href="javascript:alert(3)">危険なリンク</a>
    <a href="https://example.com/">安全なリンク</a>
    <iframe src="https://example.com/"></iframe>
    <style>body { display: none }</style>
    <form action="https://example.com/"><input name="q"></form>
  `;

  it('removes scripts, handlers, javascript: URLs and embedded content', () => {
    const html = sanitizeHtml(dangerous);
    expect(html).not.toMatch(/<script|onclick|onerror|javascript:|<iframe|<style|<form|<input/i);
    expect(html).toContain('本文');
    expect(html).toContain('href="https://example.com/"');
  });

  it('imports only safe content', () => {
    const { doc } = importOk('evil.html', dangerous);
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/alert|javascript:/);
    const links = all(doc.content)
      .flatMap((n) => n.marks ?? [])
      .filter((m) => m.type === 'link');
    expect(links.map((m) => m.attrs?.['href'])).toEqual(['https://example.com/']);
  });

  it('sanitizes raw HTML inside Markdown', () => {
    const { doc } = importOk(
      'evil.md',
      '本文<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">',
    );
    expect(JSON.stringify(doc)).not.toMatch(/alert/);
  });

  it('warns about images that are not data URIs', () => {
    const { warnings } = importOk(
      'remote.md',
      '![図](https://example.com/a.png)\n\n![図](./b.png)',
    );
    expect(warnings).toEqual([expect.stringContaining('外部参照の画像が2件あります')]);
  });
});

describe('importFile: TipTap JSON', () => {
  it('reads fixtures/spec-full.json', () => {
    const { doc } = importOk('spec-full.json', specFullJson);
    expect(ofType(doc, 'heading').map((h) => h.attrs?.['level'])).toContain(5);
    expect(ofType(doc, 'tableCell').some((c) => c.attrs?.['rowspan'] === 2)).toBe(true);
    expect(ofType(doc, 'image').length).toBeGreaterThanOrEqual(2);
  });

  it('reports invalid JSON syntax', () => {
    expect(importError('broken.json', '{ "type": ')).toContain('JSONとして読み込めません');
  });

  it('rejects JSON that is not a TipTap document', () => {
    expect(importError('other.json', '{ "name": "x" }')).toContain('TipTap JSON');
  });

  it('rejects unknown node types', () => {
    const json = JSON.stringify({ type: 'doc', content: [{ type: 'figure' }] });
    expect(importError('future.json', json)).toContain('エディターで扱えない形式です');
  });

  it('rejects a heading placed directly in a table cell', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'heading',
                      attrs: { level: 1 },
                      content: [{ type: 'text', text: 'x' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(importError('cell-heading.json', json)).toContain('エディターで扱えない形式です');
  });
});

describe('importFile: figures and table captions', () => {
  it('reads <figure> and <table><caption> from external HTML', () => {
    const { doc } = importOk(
      'figures.html',
      '<figure><img src="data:image/png;base64,AA"><figcaption>構成図</figcaption></figure>' +
        '<table><caption>画面一覧</caption><tr><th>a</th></tr></table>' +
        '<figure><table><tr><td>b</td></tr></table><figcaption>項目</figcaption></figure>',
    );
    expect(ofType(doc, 'figure').map((f) => ofType(f, 'figcaption').map(textOf))).toEqual([
      ['構成図'],
    ]);
    expect(ofType(doc, 'tableFigure').map((t) => ofType(t, 'tableCaption').map(textOf))).toEqual([
      ['画面一覧'],
      ['項目'],
    ]);
  });

  it('does not take exported numbers as text', () => {
    const { doc } = importOk(
      'exported-body.html',
      '<h1 id="h-aaaaaaaa"><span class="heading-number">1</span>概要</h1>' +
        '<div class="table-figure" id="t-aaaaaaaa"><div class="table-caption"><span class="caption-number">表1</span>一覧</div><table><tr><td>a</td></tr></table></div>',
    );
    expect(ofType(doc, 'heading').map(textOf)).toEqual(['概要']);
    expect(ofType(doc, 'tableCaption').map(textOf)).toEqual(['一覧']);
  });
});
