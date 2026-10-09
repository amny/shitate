import type { DocNode, DocRoot } from '../model';
import { computeLabels, formatRef } from './computeLabels';

let sequence = 0;
function h(level: number, text: string, attrs: Record<string, unknown> = {}): DocNode {
  sequence++;
  return {
    type: 'heading',
    attrs: { level, id: `h-${String(sequence).padStart(8, '0')}`, ...attrs },
    content: [{ type: 'text', text }],
  };
}
const doc = (...content: DocNode[]): DocRoot => ({ type: 'doc', content });
const numbers = (root: DocRoot) => computeLabels(root).toc.map((e) => e.number);

describe('computeLabels: heading numbers', () => {
  it('numbers five levels and resets lower levels', () => {
    expect(
      numbers(
        doc(
          h(1, 'a'),
          h(2, 'b'),
          h(3, 'c'),
          h(4, 'd'),
          h(5, 'e'),
          h(5, 'f'),
          h(2, 'g'),
          h(3, 'h'),
          h(1, 'i'),
          h(2, 'j'),
        ),
      ),
    ).toEqual([
      '1',
      '1.1',
      '1.1.1',
      '1.1.1.1',
      '1.1.1.1.1',
      '1.1.1.1.2',
      '1.2',
      '1.2.1',
      '2',
      '2.1',
    ]);
  });

  it('does not number H6 and H6 does not affect the counters', () => {
    expect(numbers(doc(h(1, 'a'), h(5, 'b'), h(6, 'c'), h(5, 'd'), h(6, 'e'), h(2, 'f')))).toEqual([
      '1',
      '1.1.1.1.1',
      '',
      '1.1.1.1.2',
      '',
      '1.2',
    ]);
  });

  it('does not number numbered=false headings nor advance the counters', () => {
    expect(
      numbers(doc(h(1, 'a'), h(2, 'b'), h(1, '付録', { numbered: false }), h(1, 'd'), h(2, 'e'))),
    ).toEqual(['1', '1.1', '', '2', '2.1']);
  });

  it('does not number the sub-headings of a numbered=false heading', () => {
    // A preface: chapters still start at 1.
    expect(
      numbers(
        doc(
          h(1, 'はじめに', { numbered: false }),
          h(2, '目的'),
          h(3, '背景'),
          h(1, '概要'),
          h(2, '範囲'),
        ),
      ),
    ).toEqual(['', '', '', '1', '1.1']);
  });

  it('ends the unnumbered section at a heading of the same or a higher level', () => {
    expect(
      numbers(
        doc(
          h(1, 'a'),
          h(2, 'b'),
          h(2, 'コラム', { numbered: false }),
          h(3, 'c'),
          h(4, 'd'),
          h(2, 'e'),
          h(3, 'f'),
        ),
      ),
    ).toEqual(['1', '1.1', '', '', '', '1.2', '1.2.1']);
  });

  it('does not let H6 start an unnumbered section', () => {
    expect(numbers(doc(h(5, 'a'), h(6, 'b'), h(5, 'c')))).toEqual(['1.1.1.1.1', '', '1.1.1.1.2']);
  });

  it('treats skipped levels as 1 so numbers never repeat', () => {
    // H1 -> H3: the missing H2 counts as 1; the next H2 continues from it.
    expect(numbers(doc(h(1, 'a'), h(3, 'b'), h(3, 'c'), h(2, 'd'), h(3, 'e')))).toEqual([
      '1',
      '1.1.1',
      '1.1.2',
      '1.2',
      '1.2.1',
    ]);
  });

  it('numbers a document that starts below H1', () => {
    expect(numbers(doc(h(2, 'a'), h(2, 'b'), h(1, 'c'), h(4, 'd')))).toEqual([
      '1.1',
      '1.2',
      '2',
      '2.1.1.1',
    ]);
  });

  it('reports level and text and keeps headings in TOC order', () => {
    const root = doc(
      h(1, 'はじめに'),
      { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
      {
        type: 'blockquote',
        content: [
          {
            type: 'heading',
            attrs: { level: 2, id: 'h-quoted00' },
            content: [{ type: 'text', text: '引用内' }],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 2, id: 'h-marks000' },
        content: [
          { type: 'text', text: '画面', marks: [{ type: 'bold' }] },
          { type: 'text', text: '一覧' },
        ],
      },
    );
    const labels = computeLabels(root);
    expect(labels.toc.map(({ level, number, text }) => [level, number, text])).toEqual([
      [1, '1', 'はじめに'],
      [2, '1.1', '引用内'],
      [2, '1.2', '画面一覧'],
    ]);
    expect(labels.headings.get('h-marks000')).toEqual({
      number: '1.2',
      level: 2,
      text: '画面一覧',
    });
  });

  it('still counts headings without an id but leaves them out of the maps', () => {
    const labels = computeLabels(
      doc(
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'no id' }] },
        h(1, 'b'),
      ),
    );
    expect(labels.toc.map((e) => e.number)).toEqual(['2']);
    expect(labels.headings.size).toBe(1);
  });
});

describe('computeLabels: figures and tables', () => {
  const figure = (id: string, caption: string): DocNode => ({
    type: 'figure',
    attrs: { id },
    content: [
      { type: 'image', attrs: { src: 'data:image/png;base64,AA' } },
      { type: 'figcaption', content: [{ type: 'text', text: caption }] },
    ],
  });
  const tableFigure = (id: string, caption: string, nested: DocNode[] = []): DocNode => ({
    type: 'tableFigure',
    attrs: { id },
    content: [
      { type: 'tableCaption', content: [{ type: 'text', text: caption }] },
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: nested }] }],
      },
    ],
  });

  it('numbers figures and tables through the whole document', () => {
    const labels = computeLabels(
      doc(
        h(1, 'a'),
        figure('f-00000001', '構成図'),
        tableFigure('t-00000001', '画面一覧', [
          { type: 'image', attrs: { src: 'x' } },
          { type: 'table' },
        ]),
        h(1, 'b'),
        figure('f-00000002', 'ER図'),
        tableFigure('t-00000002', '項目定義'),
      ),
    );
    expect([...labels.figures]).toEqual([
      ['f-00000001', { number: 1, caption: '構成図' }],
      ['f-00000002', { number: 2, caption: 'ER図' }],
    ]);
    expect([...labels.tables]).toEqual([
      ['t-00000001', { number: 1, caption: '画面一覧' }],
      ['t-00000002', { number: 2, caption: '項目定義' }],
    ]);
  });
});

describe('formatRef', () => {
  const labels = computeLabels(
    doc(
      {
        type: 'heading',
        attrs: { level: 1, id: 'h-chapter1' },
        content: [{ type: 'text', text: '概要' }],
      },
      {
        type: 'heading',
        attrs: { level: 2, id: 'h-section1' },
        content: [{ type: 'text', text: '目的' }],
      },
      {
        type: 'heading',
        attrs: { level: 1, id: 'h-appendix', numbered: false },
        content: [{ type: 'text', text: '付録' }],
      },
      { type: 'figure', attrs: { id: 'f-figure01' }, content: [] },
      { type: 'tableFigure', attrs: { id: 't-table001' }, content: [] },
      { type: 'tableFigure', attrs: { id: 't-table002' }, content: [] },
    ),
  );

  it.each([
    ['h-chapter1', '1節'],
    ['h-section1', '1.1節'],
    ['h-appendix', '「付録」'],
    ['f-figure01', '図1'],
    ['t-table002', '表2'],
    ['h-missing0', null],
  ])('%s -> %s', (id, expected) => {
    expect(formatRef(labels, id)).toBe(expected);
  });
});
