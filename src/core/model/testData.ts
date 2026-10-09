import type { EmbeddedData } from './types';

/** A valid EmbeddedData used as the base for schema tests. */
export function createValidEmbeddedData(): EmbeddedData {
  return {
    format: 'tiptap-spec-doc',
    version: 1,
    state: {
      doc: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1, id: 'h-abcdefgh', numbered: true },
            content: [{ type: 'text', text: 'はじめに' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '太字', marks: [{ type: 'bold' }] },
              { type: 'crossRef', attrs: { targetId: 'h-abcdefgh' } },
            ],
          },
        ],
      },
      meta: {
        title: '基本設計書',
        projectName: '顧客管理システム',
        version: '1.2',
        date: '2026-10-01',
        companyName: '株式会社サンプル',
      },
      revisions: [
        {
          id: 'r-1',
          version: '1.0',
          date: '2026-09-01',
          description: '初版',
          author: '山田',
        },
      ],
      themeId: 'standard',
    },
    theme: {
      id: 'standard',
      name: '標準',
      builtIn: true,
      css: '.doc { color: #000; }',
      settings: {
        tocDepth: 3,
        page: { size: 'A4', orientation: 'portrait', margin: 'normal', baseFontPt: 10.5 },
      },
    },
  };
}
