import { computeLabels } from '../labels';
import type { DocNode, DocRoot } from '../model';
import { buildOutline } from './buildOutline';

const text = (value: string): DocNode[] => (value === '' ? [] : [{ type: 'text', text: value }]);
const h = (id: string, level: number, value: string, attrs: Record<string, unknown> = {}) => ({
  type: 'heading',
  attrs: { id, level, ...attrs },
  content: text(value),
});
const figure = (id: string, caption: string): DocNode => ({
  type: 'figure',
  attrs: { id },
  content: [
    { type: 'image', attrs: { src: 'x.png' } },
    { type: 'figcaption', content: text(caption) },
  ],
});
const table = (id: string, caption: string): DocNode => ({
  type: 'tableFigure',
  attrs: { id },
  content: [
    { type: 'tableCaption', content: text(caption) },
    { type: 'table', content: [] },
  ],
});
const doc = (...content: DocNode[]): DocRoot => ({ type: 'doc', content });
const outlineOf = (
  root: DocRoot,
  front = { hasCover: false, hasRevisions: false, hasToc: false },
) => buildOutline({ labels: computeLabels(root), ...front });

describe('buildOutline: front items', () => {
  it('lists only the parts that exist, in output order', () => {
    const empty = doc({ type: 'paragraph' });
    expect(outlineOf(empty).front).toEqual([]);
    expect(outlineOf(empty, { hasCover: true, hasRevisions: true, hasToc: true }).front).toEqual([
      { kind: 'cover', label: '表紙' },
      { kind: 'revisions', label: '改訂履歴' },
      { kind: 'toc', label: '目次' },
    ]);
    expect(
      outlineOf(empty, { hasCover: false, hasRevisions: true, hasToc: true }).front.map(
        (item) => item.kind,
      ),
    ).toEqual(['revisions', 'toc']);
  });
});

describe('buildOutline: headings', () => {
  it('lists every heading with the numbers of computeLabels', () => {
    const outline = outlineOf(
      doc(
        h('h-1', 1, 'はじめに'),
        h('h-2', 2, '目的'),
        h('h-3', 1, '付録', { numbered: false }),
        h('h-4', 2, '用語'),
        h('h-5', 6, '補足'),
      ),
    );
    expect(outline.headings).toEqual([
      { id: 'h-1', level: 1, number: '1', text: 'はじめに' },
      { id: 'h-2', level: 2, number: '1.1', text: '目的' },
      { id: 'h-3', level: 1, number: '', text: '付録' },
      { id: 'h-4', level: 2, number: '', text: '用語' },
      { id: 'h-5', level: 6, number: '', text: '補足' },
    ]);
  });

  it('is empty without headings', () => {
    expect(outlineOf(doc({ type: 'paragraph' })).headings).toEqual([]);
  });
});

describe('buildOutline: figures and tables', () => {
  it('lists figures then tables, each numbered in document order', () => {
    const outline = outlineOf(
      doc(
        table('tbl-1', '画面一覧'),
        figure('fig-1', 'レイアウト'),
        table('tbl-2', ''),
        figure('fig-2', '遷移'),
      ),
    );
    expect(outline.captions).toEqual([
      { id: 'fig-1', kind: 'figure', number: '図1', caption: 'レイアウト' },
      { id: 'fig-2', kind: 'figure', number: '図2', caption: '遷移' },
      { id: 'tbl-1', kind: 'table', number: '表1', caption: '画面一覧' },
      { id: 'tbl-2', kind: 'table', number: '表2', caption: '' },
    ]);
  });
});
