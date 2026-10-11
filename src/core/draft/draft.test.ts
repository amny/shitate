import { createExtensions } from '../../editor/createEditor';
import { createValidEmbeddedData } from '../model/testData';
import type { EmbeddedData } from '../model';
import {
  createDraft,
  createDraftId,
  draftDisplayName,
  extractExcerpt,
  parseDraft,
  parseDraftSummary,
  sortDraftSummaries,
  summarizeDraft,
  upsertDraftSummary,
} from './draft';
import type { DraftSummary } from './draft';

const extensions = createExtensions();

/** Valid data whose body uses only nodes the Phase 1 editor knows. */
function editorData(): EmbeddedData {
  const data = createValidEmbeddedData();
  return {
    ...data,
    state: {
      ...data.state,
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
      },
    },
  };
}

describe('draft', () => {
  it('round trips a draft', () => {
    const draft = createDraft(editorData(), 'basic.md', new Date('2026-10-04T05:32:00Z'));
    expect(draft.savedAt).toBe('2026-10-04T05:32:00.000Z');
    expect(parseDraft('d-1', structuredClone(draft), extensions)).toEqual({
      ok: true,
      draft: { id: 'd-1', ...draft },
    });
  });

  it('accepts a draft without a file name', () => {
    const draft = createDraft(editorData(), null, new Date());
    expect(parseDraft('d-1', draft, extensions).ok).toBe(true);
  });

  it.each([null, 'text', { savedAt: 'yesterday', fileName: null, data: {} }])(
    'rejects a malformed draft: %o',
    (value) => {
      expect(parseDraft('d-1', value, extensions)).toEqual({
        ok: false,
        error: '自動保存データの形式が不正です',
      });
    },
  );

  it('rejects an unsupported data version', () => {
    const draft = createDraft(editorData(), null, new Date());
    const result = parseDraft('d-1', { ...draft, data: { ...draft.data, version: 2 } }, extensions);
    expect(!result.ok && result.error).toContain('未対応の形式バージョンです');
  });

  it('rejects a body the editor cannot load', () => {
    const data = editorData();
    const broken: EmbeddedData = {
      ...data,
      state: { ...data.state, doc: { type: 'doc', content: [{ type: 'unknownNode' }] } },
    };
    const result = parseDraft('d-1', createDraft(broken, null, new Date()), extensions);
    expect(!result.ok && result.error).toContain('エディターで扱えない形式です');
  });
});

function summary(id: string, savedAt: string, title = ''): DraftSummary {
  return { id, title, fileName: null, excerpt: '', savedAt };
}

describe('draft summaries', () => {
  it('summarizes a draft with its cover title', () => {
    const draft = createDraft(editorData(), 'basic.md', new Date('2026-10-04T05:32:00Z'));
    expect(summarizeDraft('d-1', draft)).toEqual({
      id: 'd-1',
      title: '基本設計書',
      fileName: 'basic.md',
      excerpt: '本文',
      savedAt: '2026-10-04T05:32:00.000Z',
    });
  });

  it('parses a valid summary and rejects a malformed one', () => {
    const valid = summary('d-1', '2026-10-04T05:32:00.000Z', '設計書');
    expect(parseDraftSummary(structuredClone(valid))).toEqual(valid);
    expect(parseDraftSummary({ ...valid, id: '' })).toBeNull();
    expect(parseDraftSummary({ ...valid, savedAt: 'yesterday' })).toBeNull();
    expect(parseDraftSummary('d-1')).toBeNull();
  });

  it('sorts newest first without changing the input', () => {
    const input = [
      summary('a', '2026-10-01T00:00:00.000Z'),
      summary('b', '2026-10-03T00:00:00.000Z'),
      summary('c', '2026-10-02T00:00:00.000Z'),
    ];
    expect(sortDraftSummaries(input).map((s) => s.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('upserts by id', () => {
    const list = [
      summary('a', '2026-10-02T00:00:00.000Z'),
      summary('b', '2026-10-01T00:00:00.000Z'),
    ];
    const updated = upsertDraftSummary(list, summary('b', '2026-10-03T00:00:00.000Z', '新'));
    expect(updated.map((s) => [s.id, s.title])).toEqual([
      ['b', '新'],
      ['a', ''],
    ]);
    expect(upsertDraftSummary(list, summary('c', '2026-10-04T00:00:00.000Z'))).toHaveLength(3);
  });

  it('names a document by title, file name, body, then as untitled', () => {
    expect(draftDisplayName({ title: '設計書', fileName: 'a.md', excerpt: '本文' })).toBe('設計書');
    expect(draftDisplayName({ title: '  ', fileName: 'a.md', excerpt: '本文' })).toBe('a.md');
    expect(draftDisplayName({ title: '', fileName: null, excerpt: '本文' })).toBe('本文');
    expect(draftDisplayName({ title: '', fileName: null, excerpt: '' })).toBe('無題の文書');
  });

  it('takes the excerpt from the first block with text', () => {
    const doc = {
      content: [
        { type: 'paragraph' },
        { type: 'image', attrs: { src: 'data:' } },
        {
          type: 'heading',
          content: [
            { type: 'text', text: 'はじめに  ' },
            { type: 'text', text: '\n概要', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
      ],
    };
    expect(extractExcerpt(doc)).toBe('はじめに 概要');
    expect(extractExcerpt({})).toBe('');
  });

  it('cuts a long excerpt to 40 characters', () => {
    const text = 'あ'.repeat(39) + '🎉' + 'い';
    const excerpt = extractExcerpt({
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    expect(excerpt).toBe('あ'.repeat(39) + '🎉…');
  });

  it('creates distinct ids', () => {
    const id = createDraftId();
    expect(id).toMatch(/^d-[0-9a-z]{10}$/);
    expect(createDraftId()).not.toBe(id);
  });
});
