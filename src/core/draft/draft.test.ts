import { createExtensions } from '../../editor/createEditor';
import { createValidEmbeddedData } from '../model/testData';
import type { EmbeddedData } from '../model';
import { createDraft, parseDraft } from './draft';

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
    expect(parseDraft(structuredClone(draft), extensions)).toEqual({ ok: true, draft });
  });

  it('accepts a draft without a file name', () => {
    const draft = createDraft(editorData(), null, new Date());
    expect(parseDraft(draft, extensions).ok).toBe(true);
  });

  it.each([null, 'text', { savedAt: 'yesterday', fileName: null, data: {} }])(
    'rejects a malformed draft: %o',
    (value) => {
      expect(parseDraft(value, extensions)).toEqual({
        ok: false,
        error: '自動保存データの形式が不正です',
      });
    },
  );

  it('rejects an unsupported data version', () => {
    const draft = createDraft(editorData(), null, new Date());
    const result = parseDraft({ ...draft, data: { ...draft.data, version: 2 } }, extensions);
    expect(!result.ok && result.error).toContain('未対応の形式バージョンです');
  });

  it('rejects a body the editor cannot load', () => {
    const data = editorData();
    const broken: EmbeddedData = {
      ...data,
      state: { ...data.state, doc: { type: 'doc', content: [{ type: 'unknownNode' }] } },
    };
    const result = parseDraft(createDraft(broken, null, new Date()), extensions);
    expect(!result.ok && result.error).toContain('エディターで扱えない形式です');
  });
});
