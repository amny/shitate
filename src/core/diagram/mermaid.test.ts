import type { DocNode } from '../model';
import {
  collectMermaidSources,
  isMermaidLanguage,
  normalizeMermaidSvg,
  replaceDiagramId,
} from './mermaid';

const code = (language: string | null, text: string): DocNode => ({
  type: 'codeBlock',
  attrs: { language },
  content: text === '' ? [] : [{ type: 'text', text }],
});

function parseSvg(svg: string): Element {
  return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
}

describe('isMermaidLanguage', () => {
  it.each(['mermaid', 'Mermaid', ' MERMAID '])('accepts %j', (language) => {
    expect(isMermaidLanguage(language)).toBe(true);
  });

  it.each([null, undefined, '', 'mmd', 'typescript', 1])('rejects %j', (language) => {
    expect(isMermaidLanguage(language)).toBe(false);
  });
});

describe('collectMermaidSources', () => {
  it('returns the Mermaid sources in document order, also inside tables', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        code('mermaid', 'flowchart LR\n  A --> B'),
        code('sql', 'SELECT 1;'),
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', content: [code('Mermaid', 'pie\n  "a" : 1')] }],
            },
          ],
        },
        code(null, 'text'),
        code('mermaid', ''),
      ],
    };
    expect(collectMermaidSources(doc)).toEqual(['flowchart LR\n  A --> B', 'pie\n  "a" : 1', '']);
  });

  it('returns nothing for a document without diagrams', () => {
    expect(collectMermaidSources({ type: 'doc', content: [code('sql', 'SELECT 1;')] })).toEqual([]);
  });
});

describe('normalizeMermaidSvg', () => {
  const rendered =
    '<svg id="m1" width="100%" xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 200.4 120.2" ' +
    'style="max-width: 200.4px; background-color: white;" role="graphics-document document">' +
    '<style>#m1 .node rect{fill:#eee;}</style>' +
    '<defs><marker id="m1_arrow" viewBox="0 0 10 10"><path d="M0,0L10,5L0,10z"/></marker></defs>' +
    '<g><path d="M0,0L10,10" marker-end="url(#m1_arrow)"/><text x="1" y="2">顧客一覧</text></g>' +
    '</svg>';

  it('sets the natural size from the viewBox and lets the diagram shrink to the width', () => {
    const root = parseSvg(normalizeMermaidSvg(rendered));
    expect(root.getAttribute('width')).toBe('201');
    expect(root.getAttribute('height')).toBe('121');
    expect(root.getAttribute('style')).toBe(
      'background-color: white; max-width: 100%; height: auto',
    );
  });

  it('keeps the styles, markers, references and text', () => {
    const root = parseSvg(normalizeMermaidSvg(rendered));
    expect(root.getAttribute('id')).toBe('m1');
    expect(root.querySelector('style')?.textContent).toBe('#m1 .node rect{fill:#eee;}');
    expect(root.querySelector('marker')?.getAttribute('id')).toBe('m1_arrow');
    expect(root.querySelector('path[marker-end]')?.getAttribute('marker-end')).toBe(
      'url(#m1_arrow)',
    );
    expect(root.querySelector('text')?.textContent).toBe('顧客一覧');
  });

  it('removes scripts, event handlers and foreignObject', () => {
    const svg = normalizeMermaidSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">' +
        '<script>alert(2)</script><foreignObject><div>html</div></foreignObject>' +
        '<a href="javascript:alert(3)"><text>x</text></a></svg>',
    );
    expect(svg).not.toMatch(/script|onload|foreignObject|javascript:/i);
  });

  it('keeps the size attributes when the viewBox is missing', () => {
    const root = parseSvg(
      normalizeMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg" width="50"/>'),
    );
    expect(root.getAttribute('width')).toBe('50');
    expect(root.getAttribute('style')).toBe('max-width: 100%; height: auto');
  });

  it('throws when the output is not an SVG', () => {
    expect(() => normalizeMermaidSvg('<p>not svg</p>')).toThrow(/not an SVG/);
  });
});

describe('replaceDiagramId', () => {
  it('replaces the temporary id in the root, the styles and the references', () => {
    const svg =
      '<svg id="mtmp"><style>#mtmp .a{}</style><marker id="mtmp_arrow"/>' +
      '<path marker-end="url(#mtmp_arrow)"/></svg>';
    expect(replaceDiagramId(svg, 'mtmp', 'mermaid-2')).toBe(
      '<svg id="mermaid-2"><style>#mermaid-2 .a{}</style><marker id="mermaid-2_arrow"/>' +
        '<path marker-end="url(#mermaid-2_arrow)"/></svg>',
    );
  });
});
