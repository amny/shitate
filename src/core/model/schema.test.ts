import { createDefaultMeta, DEFAULT_PAGE_SETTINGS, toIsoDate } from './defaults';
import {
  docMetaSchema,
  docNodeSchema,
  embeddedDataSchema,
  pageSettingsSchema,
  themeSettingsSchema,
} from './schema';
import { createValidEmbeddedData } from './testData';

describe('embeddedDataSchema', () => {
  it('accepts valid embedded data', () => {
    expect(embeddedDataSchema.safeParse(createValidEmbeddedData()).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const data = createValidEmbeddedData();
    const withOptionals = {
      ...data,
      state: {
        ...data.state,
        meta: { ...data.state.meta, clientName: '顧客株式会社' },
        settingsOverride: { copyright: '© 2026 サンプル' },
      },
      theme: {
        ...data.theme,
        builtIn: false,
        baseId: 'standard',
        settings: { ...data.theme.settings, logoDataUri: 'data:image/png;base64,AAAA' },
      },
    };
    expect(embeddedDataSchema.safeParse(withOptionals).success).toBe(true);
  });

  it('rejects a different format name', () => {
    const data = { ...createValidEmbeddedData(), format: 'other' };
    expect(embeddedDataSchema.safeParse(data).success).toBe(false);
  });

  it('rejects an unsupported version', () => {
    const data = { ...createValidEmbeddedData(), version: 2 };
    expect(embeddedDataSchema.safeParse(data).success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const data = createValidEmbeddedData();
    const { title, ...metaWithoutTitle } = data.state.meta;
    const broken = { ...data, state: { ...data.state, meta: metaWithoutTitle } };
    const result = embeddedDataSchema.safeParse(broken);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['state', 'meta', 'title']);
  });

  it('rejects a non-ISO date', () => {
    const data = createValidEmbeddedData();
    const broken = {
      ...data,
      state: { ...data.state, meta: { ...data.state.meta, date: '2026/10/01' } },
    };
    expect(embeddedDataSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a body whose root is not "doc"', () => {
    const data = createValidEmbeddedData();
    const broken = { ...data, state: { ...data.state, doc: { type: 'paragraph' } } };
    expect(embeddedDataSchema.safeParse(broken).success).toBe(false);
  });
});

describe('docNodeSchema', () => {
  it('rejects a nested node without type', () => {
    const node = { type: 'paragraph', content: [{ text: 'no type' }] };
    const result = docNodeSchema.safeParse(node);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['content', 0, 'type']);
  });

  it('keeps unknown attributes and keys', () => {
    const node = {
      type: 'tableCell',
      attrs: { colspan: 2, rowspan: 1, colwidth: [120, 80] },
      content: [{ type: 'paragraph', futureKey: 'kept' }],
    };
    expect(docNodeSchema.parse(node)).toEqual(node);
  });
});

describe('pageSettingsSchema', () => {
  it('accepts the default page settings', () => {
    expect(pageSettingsSchema.safeParse(DEFAULT_PAGE_SETTINGS).success).toBe(true);
  });

  it('requires customMm when size is custom', () => {
    const result = pageSettingsSchema.safeParse({ ...DEFAULT_PAGE_SETTINGS, size: 'custom' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['customMm']);
  });

  it('accepts custom size within 100-1000mm', () => {
    const page = {
      ...DEFAULT_PAGE_SETTINGS,
      size: 'custom',
      customMm: { width: 100, height: 1000 },
    };
    expect(pageSettingsSchema.safeParse(page).success).toBe(true);
  });

  it.each([[{ width: 99, height: 297 }], [{ width: 210, height: 1001 }]])(
    'rejects custom size out of range: %o',
    (customMm) => {
      const page = { ...DEFAULT_PAGE_SETTINGS, size: 'custom', customMm };
      expect(pageSettingsSchema.safeParse(page).success).toBe(false);
    },
  );

  it.each([8.5, 12.5])('rejects baseFontPt out of 9-12: %d', (baseFontPt) => {
    expect(pageSettingsSchema.safeParse({ ...DEFAULT_PAGE_SETTINGS, baseFontPt }).success).toBe(
      false,
    );
  });
});

describe('themeSettingsSchema', () => {
  it.each([0, 6, 2.5])('rejects tocDepth %d', (tocDepth) => {
    const settings = { tocDepth, page: DEFAULT_PAGE_SETTINGS };
    expect(themeSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it('rejects a logo that is not an image data URI', () => {
    const settings = {
      tocDepth: 3,
      page: DEFAULT_PAGE_SETTINGS,
      logoDataUri: 'https://example.com/logo.png',
    };
    expect(themeSettingsSchema.safeParse(settings).success).toBe(false);
  });
});

describe('default document info', () => {
  it('formats the local date as ISO', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('creates empty cover info dated today', () => {
    const meta = createDefaultMeta(new Date(2026, 9, 3));
    expect(meta).toEqual({
      title: '',
      projectName: '',
      version: '',
      date: '2026-10-03',
      companyName: '',
    });
    expect(docMetaSchema.safeParse(meta).success).toBe(true);
  });
});
