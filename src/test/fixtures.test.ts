import basicMd from '../../fixtures/basic.md?raw';
import complexTableHtml from '../../fixtures/complex-table.html?raw';
import specFullJson from '../../fixtures/spec-full.json?raw';
import { docRootSchema } from '../core/model';
import type { DocNode } from '../core/model';

function collectNodes(nodes: readonly DocNode[] | undefined): DocNode[] {
  return (nodes ?? []).flatMap((node) => [node, ...collectNodes(node.content)]);
}

describe('fixtures/basic.md', () => {
  it('contains a GFM table with alignment', () => {
    expect(basicMd).toMatch(/^\|:-+\|:-+:\|:-+:\|-+:\|$/m);
  });

  it('contains nested bullet and ordered lists', () => {
    expect(basicMd).toMatch(/^ {4}- /m);
    expect(basicMd).toMatch(/^ {3}1\. /m);
  });
});

describe('fixtures/complex-table.html', () => {
  const doc = new DOMParser().parseFromString(complexTableHtml, 'text/html');
  const cells = [...doc.querySelectorAll('td, th')];

  it('contains merged cells', () => {
    expect(doc.querySelector('[colspan="2"], [colspan="3"]')).not.toBeNull();
    expect(doc.querySelector('[rowspan="2"]')).not.toBeNull();
  });

  it('contains lists inside cells', () => {
    expect(cells.some((cell) => cell.querySelector(':scope > ul'))).toBe(true);
    expect(cells.some((cell) => cell.querySelector(':scope > ol'))).toBe(true);
  });

  it('contains a nested table', () => {
    expect(doc.querySelector('td table')).not.toBeNull();
  });

  it('contains images inside cells as embedded data URIs', () => {
    const images = [...doc.querySelectorAll('td img')];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    }
  });
});

describe('fixtures/spec-full.json', () => {
  const doc = docRootSchema.parse(JSON.parse(specFullJson));
  const nodes = collectNodes(doc.content);

  it('has headings from level 1 to 6', () => {
    const levels = new Set(
      nodes.filter((n) => n.type === 'heading').map((n) => n.attrs?.['level']),
    );
    expect([...levels].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has tables with merged cells and a nested table', () => {
    const cells = nodes.filter((n) => n.type === 'tableCell' || n.type === 'tableHeader');
    expect(cells.some((c) => c.attrs?.['colspan'] === 2)).toBe(true);
    expect(cells.some((c) => c.attrs?.['rowspan'] === 2)).toBe(true);
    expect(cells.some((c) => c.content?.some((child) => child.type === 'table'))).toBe(true);
  });

  it('has images in figures and inside a cell, all as data URIs', () => {
    expect(doc.content?.some((n) => n.type === 'figure')).toBe(true);
    const images = nodes.filter((n) => n.type === 'image');
    expect(images.length).toBeGreaterThanOrEqual(2);
    for (const image of images) {
      expect(image.attrs?.['src']).toMatch(/^data:image\/png;base64,/);
    }
  });
});

describe('fixtures/spec-full.json: headings for numbering', () => {
  const doc = docRootSchema.parse(JSON.parse(specFullJson));
  const headings = collectNodes(doc.content).filter((n) => n.type === 'heading');

  it('gives every heading a unique stable id', () => {
    const ids = headings.map((h) => h.attrs?.['id']);
    expect(ids.every((id) => typeof id === 'string' && /^h-[0-9a-z]{8}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has an unnumbered heading', () => {
    expect(headings.some((h) => h.attrs?.['numbered'] === false)).toBe(true);
  });
});

describe('fixtures/spec-full.json: figures and captioned tables', () => {
  const doc = docRootSchema.parse(JSON.parse(specFullJson));
  const nodes = collectNodes(doc.content);

  it('has two figures and two captioned tables (one landscape)', () => {
    expect(nodes.filter((n) => n.type === 'figure')).toHaveLength(2);
    const tables = nodes.filter((n) => n.type === 'tableFigure');
    expect(tables).toHaveLength(2);
    expect(tables.some((t) => t.attrs?.['landscape'] === true)).toBe(true);
  });
});

describe('fixtures/spec-full.json: cross references', () => {
  const doc = docRootSchema.parse(JSON.parse(specFullJson));
  const nodes = collectNodes(doc.content);

  it('references a table, a figure, a numbered and an unnumbered heading that exist', () => {
    const ids = new Set<unknown>(
      nodes.map((n) => n.attrs?.['id']).filter((id) => typeof id === 'string'),
    );
    const targets = nodes.filter((n) => n.type === 'crossRef').map((n) => n.attrs?.['targetId']);
    expect(targets).toHaveLength(4);
    expect(targets.every((id) => ids.has(id))).toBe(true);
  });
});

describe('fixtures/spec-full.json: table of contents', () => {
  const doc = docRootSchema.parse(JSON.parse(specFullJson));

  it('starts with the table of contents', () => {
    expect(doc.content?.[0]?.type).toBe('toc');
    expect(collectNodes(doc.content).filter((n) => n.type === 'toc')).toHaveLength(1);
  });
});
