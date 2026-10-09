import basicMd from '../../../fixtures/basic.md?raw';
import complexTableHtml from '../../../fixtures/complex-table.html?raw';
import specFullJson from '../../../fixtures/spec-full.json?raw';
import { createExtensions } from '../../editor/createEditor';
import { importFile } from '../import';
import type { ImportResult } from '../import';
import type { DocRoot, DocumentState, Theme } from '../model';
import { getDefaultTheme } from '../theme/builtinThemes';
import { buildExportHtml } from './buildExportHtml';
import { toExportFileName } from './fileName';

const extensions = createExtensions();
const theme = getDefaultTheme();

function importDocument(name: string, text: string): DocRoot {
  const result = importFile({ name, text }, { extensions });
  if (!result.ok || result.kind !== 'document') {
    throw new Error(`Failed to import ${name}: ${result.ok ? result.kind : result.error}`);
  }
  return result.doc;
}

function createState(doc: DocRoot): DocumentState {
  return {
    doc,
    meta: {
      title: '基本設計書 "A&B" </title>',
      projectName: '顧客管理システム',
      version: '1.2',
      date: '2026-10-01',
      companyName: '株式会社サンプル',
      clientName: '顧客株式会社',
    },
    revisions: [
      { id: 'r-1', version: '1.0', date: '2026-09-01', description: '初版', author: '山田' },
      {
        id: 'r-2',
        version: '1.2',
        date: '2026-10-01',
        description: '</script> を含む説明',
        author: '佐藤',
      },
    ],
    themeId: theme.id,
    settingsOverride: { copyright: '© 2026 "サンプル"' },
  };
}

function reimport(html: string): ImportResult {
  return importFile({ name: 'exported.html', text: html }, { extensions });
}

describe('export -> import round trip (fixtures)', () => {
  it.each([
    ['basic.md', basicMd],
    ['complex-table.html', complexTableHtml],
    ['spec-full.json', specFullJson],
  ])('%s', (name, text) => {
    const state = createState(importDocument(name, text));
    const result = reimport(buildExportHtml(state, theme, { extensions }));
    expect(result).toMatchObject({ ok: true, kind: 'embedded' });
    if (result.ok && result.kind === 'embedded') {
      expect(result.data.state).toEqual(state);
      expect(result.data.theme).toEqual(theme);
    }
  });

  it('round trips a state without optional fields', () => {
    const { settingsOverride: _omitted, ...state } = createState(importDocument('a.md', '本文'));
    const result = reimport(buildExportHtml(state, theme, { extensions }));
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });
});

describe('buildExportHtml: output structure', () => {
  const state = createState(importDocument('basic.md', basicMd));
  const html = buildExportHtml(state, theme, { extensions });
  const dom = new DOMParser().parseFromString(html, 'text/html');

  it('is a complete Japanese HTML document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(dom.documentElement.lang).toBe('ja');
    expect(dom.querySelector('meta[charset="utf-8"]')).not.toBeNull();
    expect(dom.title).toBe('基本設計書 "A&B" </title>');
  });

  it('embeds the theme CSS and renders the body inside .doc > .doc-body', () => {
    expect(dom.querySelector('style#theme')?.textContent).toBe(theme.css);
    expect(dom.querySelector('.doc > main.doc-body > h1')?.textContent).toBe(
      '顧客管理システム 要件定義書',
    );
    expect(dom.querySelectorAll('.doc-body table')).toHaveLength(1);
  });

  it('keeps images as data URIs (no external references)', () => {
    const sources = [...dom.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(src).toMatch(/^data:image\//);
    }
    expect(html).not.toMatch(/<link\b|<script\b[^>]*\bsrc=/i);
  });
});

describe('buildExportHtml: escaping', () => {
  const tricky = '</script><script>alert(1)</script><!-- </style> & "引用"';
  const doc = importDocument(
    'tricky.json',
    JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: tricky }] }],
    }),
  );
  const state = createState(doc);
  const themeWithStyleEnd: Theme = {
    ...theme,
    css: `${theme.css}\n/* </style><script>alert(2)</script> */`,
  };
  const html = buildExportHtml(state, themeWithStyleEnd, { extensions });

  it('does not break the embedded JSON with </script> or <!--', () => {
    const plain = buildExportHtml(state, theme, { extensions });
    expect(plain.match(/<\/script>/g)).toHaveLength(1);
    expect(plain).not.toContain('<!--');
    const result = reimport(plain);
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });

  it('does not let theme CSS close the <style> element', () => {
    // Two <style> elements: theme-vars and theme.
    expect(html.match(/<\/style>/gi)).toHaveLength(2);
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelectorAll('script')).toHaveLength(1);
  });

  it('shows the tricky text as text in the body', () => {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('.doc-body p')?.textContent).toBe(tricky);
  });
});

describe('self-format import errors', () => {
  const state = createState(importDocument('a.md', '本文'));
  const html = buildExportHtml(state, theme, { extensions });

  it('reports broken embedded JSON instead of reading the body', () => {
    const broken = html.replace(/(id="doc-data">)\{/, '$1{broken');
    const result = reimport(broken);
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toContain('埋め込みデータを読み込めません');
  });

  it('reports an unsupported version', () => {
    const newer = html.replace('"version":1,', '"version":2,');
    const result = reimport(newer);
    expect(!result.ok && result.error).toContain('未対応の形式バージョンです');
  });

  it('reports invalid content', () => {
    const invalid = html.replace('"date":"2026-10-01"', '"date":"10/01"');
    const result = reimport(invalid);
    expect(!result.ok && result.error).toContain('state.meta.date');
  });

  it('treats HTML without doc-data as external HTML', () => {
    expect(reimport('<p>本文</p>')).toMatchObject({ ok: true, kind: 'document' });
  });
});

describe('toExportFileName', () => {
  it.each([
    ['basic.md', '', 'basic.html'],
    ['設計書.v1.html', '', '設計書.v1.html'],
    [null, '基本設計書', '基本設計書.html'],
    [null, '  ', '文書.html'],
    [null, 'A/B:C*D?"E"<F>|G', 'A_B_C_D__E__F__G.html'],
    ['tab\there.md', '', 'tab_here.html'],
  ])('(%o, %o) -> %s', (source, title, expected) => {
    expect(toExportFileName(source, title)).toBe(expected);
  });
});

describe('buildExportHtml: heading numbers', () => {
  const heading = (level: number, id: string, text: string, numbered = true) => ({
    type: 'heading',
    attrs: { level, id, numbered },
    content: [{ type: 'text', text }],
  });
  const state = createState({
    type: 'doc',
    content: [
      heading(1, 'h-number01', 'はじめに'),
      heading(2, 'h-number02', '目的'),
      heading(1, 'h-number03', '付録', false),
      heading(6, 'h-number04', '補足'),
      heading(1, 'h-number05', '設計'),
    ],
  });
  const html = buildExportHtml(state, theme, { extensions });
  const dom = new DOMParser().parseFromString(html, 'text/html');

  it('outputs ids and resolved numbers', () => {
    const headings = [...dom.querySelectorAll('.doc-body :is(h1, h2, h6)')].map((h) => [
      h.id,
      h.querySelector('.heading-number')?.textContent ?? null,
      h.textContent,
    ]);
    expect(headings).toEqual([
      ['h-number01', '1', '1はじめに'],
      ['h-number02', '1.1', '1.1目的'],
      ['h-number03', null, '付録'],
      ['h-number04', null, '補足'],
      ['h-number05', '2', '2設計'],
    ]);
  });

  it('puts the number before the heading text', () => {
    expect(html).toContain(
      '<h1 id="h-number01"><span class="heading-number">1</span>はじめに</h1>',
    );
  });

  it('keeps numbers out of the embedded data', () => {
    const result = reimport(html);
    // The embedded body is the original state: no number spans were added to it.
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });
});

describe('buildExportHtml: figure and table numbers', () => {
  const caption = (type: string, value: string) => ({
    type,
    content: [{ type: 'text', text: value }],
  });
  const state = createState({
    type: 'doc',
    content: [
      {
        type: 'figure',
        attrs: { id: 'f-figure01' },
        content: [
          { type: 'image', attrs: { src: 'data:image/png;base64,AA' } },
          caption('figcaption', '構成図'),
        ],
      },
      {
        type: 'tableFigure',
        attrs: { id: 't-table001', landscape: true },
        content: [
          caption('tableCaption', '画面一覧'),
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
              },
            ],
          },
        ],
      },
      {
        type: 'figure',
        attrs: { id: 'f-figure02' },
        content: [
          { type: 'image', attrs: { src: 'data:image/png;base64,AA' } },
          caption('figcaption', 'ER図'),
        ],
      },
    ],
  });
  const html = buildExportHtml(state, theme, { extensions });
  const dom = new DOMParser().parseFromString(html, 'text/html');

  it('outputs captions with resolved numbers and ids', () => {
    expect(
      [...dom.querySelectorAll('.doc-body figure')].map((f) => [
        f.id,
        f.querySelector('figcaption')?.innerHTML,
      ]),
    ).toEqual([
      ['f-figure01', '<span class="caption-number">図1</span>構成図'],
      ['f-figure02', '<span class="caption-number">図2</span>ER図'],
    ]);
    const tableFigure = dom.querySelector('.doc-body .table-figure');
    expect(tableFigure?.id).toBe('t-table001');
    expect(tableFigure?.classList.contains('is-landscape')).toBe(true);
    expect(tableFigure?.querySelector(':scope > .table-caption')?.innerHTML).toBe(
      '<span class="caption-number">表1</span>画面一覧',
    );
  });

  it('round trips captions through export and import', () => {
    const result = reimport(html);
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });
});

describe('buildExportHtml: resized images', () => {
  const src = 'data:image/png;base64,AA';
  const sized = (width: number, height: number) => ({
    type: 'image',
    attrs: { src, alt: null, title: null, width, height },
  });
  const state = createState({
    type: 'doc',
    content: [
      sized(320, 160),
      {
        type: 'figure',
        attrs: { id: 'f-figure01' },
        content: [sized(240, 120), { type: 'figcaption', content: [{ type: 'text', text: '図' }] }],
      },
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [sized(80, 40)] }] }],
      },
    ],
  });
  const html = buildExportHtml(state, theme, { extensions });
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const sizes = (root: ParentNode) =>
    [...root.querySelectorAll('.doc-body img')].map((img) => [
      img.getAttribute('width'),
      img.getAttribute('height'),
    ]);

  it('outputs the size as width / height attributes', () => {
    expect(sizes(dom)).toEqual([
      ['320', '160'],
      ['240', '120'],
      ['80', '40'],
    ]);
  });

  it('round trips the size through export and import', () => {
    const result = reimport(html);
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });

  it('reads the size back when imported as external HTML', () => {
    const body = dom.querySelector('main.doc-body')?.outerHTML ?? '';
    const result = importFile({ name: 'external.html', text: body }, { extensions });
    if (!result.ok || result.kind !== 'document') {
      throw new Error('external HTML import failed');
    }
    const images: unknown[] = [];
    const collect = (node: {
      type?: string | undefined;
      attrs?: unknown;
      content?: readonly unknown[] | undefined;
    }): void => {
      if (node.type === 'image') images.push(node.attrs);
      for (const child of node.content ?? []) collect(child as typeof node);
    };
    collect(result.doc);
    expect(images).toEqual([
      expect.objectContaining({ width: 320, height: 160 }),
      expect.objectContaining({ width: 240, height: 120 }),
      expect.objectContaining({ width: 80, height: 40 }),
    ]);
  });
});

describe('buildExportHtml: cross references', () => {
  const state = createState({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, id: 'h-xref0001' },
        content: [{ type: 'text', text: '概要' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '詳細は' },
          { type: 'crossRef', attrs: { targetId: 'h-xref0001' } },
          { type: 'text', text: '、' },
          { type: 'crossRef', attrs: { targetId: 'h-missing0' } },
        ],
      },
    ],
  });
  const html = buildExportHtml(state, theme, { extensions });

  it('outputs links with resolved text, and 参照先なし for missing targets', () => {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('.doc-body p')?.innerHTML).toBe(
      '詳細は<a class="xref" href="#h-xref0001">1節</a>、<span class="xref">参照先なし</span>',
    );
  });

  it('round trips references through export and import', () => {
    const result = reimport(html);
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });

  it('reads exported links back as references when imported as external HTML', () => {
    const body =
      new DOMParser().parseFromString(html, 'text/html').querySelector('main')?.innerHTML ?? '';
    const doc = importDocument('body.html', body);
    const refs = JSON.stringify(doc).match(/"crossRef","attrs":\{"targetId":"([^"]+)"/g);
    expect(refs).toEqual(['"crossRef","attrs":{"targetId":"h-xref0001"']);
  });
});

describe('buildExportHtml: table of contents', () => {
  const heading = (level: number, id: string, text: string, numbered = true) => ({
    type: 'heading',
    attrs: { level, id, numbered },
    content: [{ type: 'text', text }],
  });
  const doc: DocRoot = {
    type: 'doc',
    content: [
      { type: 'toc' },
      heading(1, 'h-toc00001', '概要'),
      heading(2, 'h-toc00002', '目的 <A&B>'),
      heading(3, 'h-toc00003', '詳細'),
      heading(4, 'h-toc00004', '補足'),
      heading(1, 'h-toc00005', '付録', false),
    ],
  };

  function tocOf(html: string) {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    return { dom, nav: dom.querySelector('.doc > nav.doc-toc') };
  }

  it('outputs nav.doc-toc before <main>, with links, numbers and levels', () => {
    const { dom, nav } = tocOf(buildExportHtml(createState(doc), theme, { extensions }));
    expect(nav?.nextElementSibling?.tagName).toBe('MAIN');
    expect(nav?.getAttribute('aria-label')).toBe('目次');
    expect(nav?.querySelector('.toc-title')?.textContent).toBe('目次');
    expect(
      [...(nav?.querySelectorAll('a.toc-item') ?? [])].map((a) => [
        a.className,
        a.getAttribute('href'),
        a.querySelector('.toc-number')?.textContent ?? null,
        a.textContent,
      ]),
    ).toEqual([
      ['toc-item toc-level-1', '#h-toc00001', '1', '1概要'],
      ['toc-item toc-level-2', '#h-toc00002', '1.1', '1.1目的 <A&B>'],
      ['toc-item toc-level-3', '#h-toc00003', '1.1.1', '1.1.1詳細'],
      ['toc-item toc-level-1', '#h-toc00005', null, '付録'],
    ]);
    // The TOC node itself is not part of the body.
    expect(dom.querySelector('main nav, main .doc-toc')).toBeNull();
    expect(dom.querySelector('main')?.firstElementChild?.id).toBe('h-toc00001');
  });

  it('uses the document override of the depth before the theme setting', () => {
    const depths = (state: DocumentState, t: Theme) =>
      tocOf(buildExportHtml(state, t, { extensions })).nav?.querySelectorAll('.toc-item').length;
    const shallowTheme: Theme = { ...theme, settings: { ...theme.settings, tocDepth: 1 } };
    expect(depths(createState(doc), shallowTheme)).toBe(2);
    expect(depths({ ...createState(doc), settingsOverride: { tocDepth: 4 } }, shallowTheme)).toBe(
      5,
    );
  });

  it('outputs no TOC when the document has none', () => {
    const state = createState({ ...doc, content: doc.content?.slice(1) });
    expect(tocOf(buildExportHtml(state, theme, { extensions })).nav).toBeNull();
  });

  it('round trips the TOC through export and import', () => {
    const state = createState(doc);
    const result = reimport(buildExportHtml(state, theme, { extensions }));
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
  });

  it('reads the exported TOC back as a TOC node when imported as external HTML', () => {
    const html = buildExportHtml(createState(doc), theme, { extensions });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    dom.getElementById('doc-data')?.remove();
    const imported = importDocument('external.html', dom.body.innerHTML);
    expect(imported.content?.[0]).toEqual({ type: 'toc' });
    expect(imported.content?.filter((n) => n.type === 'toc')).toHaveLength(1);
  });
});

describe('buildExportHtml: cover and revisions', () => {
  const doc: DocRoot = {
    type: 'doc',
    content: [
      { type: 'toc' },
      {
        type: 'heading',
        attrs: { level: 1, id: 'h-cover001' },
        content: [{ type: 'text', text: '概要' }],
      },
    ],
  };

  it('outputs cover -> revisions -> TOC -> body -> footer', () => {
    const html = buildExportHtml(createState(doc), theme, { extensions });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect([...(dom.querySelector('.doc')?.children ?? [])].map((el) => el.className)).toEqual([
      'doc-cover',
      'doc-revisions',
      'doc-toc',
      'doc-body',
      // createState overrides the copyright.
      'doc-footer',
    ]);
    expect(dom.querySelector('.cover-title')?.textContent).toBe('基本設計書 "A&B" </title>');
    expect(dom.querySelectorAll('.doc-revisions tbody tr')).toHaveLength(2);
  });

  it('omits an empty cover and revisions', () => {
    const state: DocumentState = {
      ...createState(doc),
      meta: { title: '', projectName: '', version: '', date: '2026-10-01', companyName: '' },
      revisions: [],
    };
    const dom = new DOMParser().parseFromString(
      buildExportHtml(state, theme, { extensions }),
      'text/html',
    );
    expect(dom.querySelector('.doc-cover, .doc-revisions')).toBeNull();
  });

  it('keeps meta and revisions through export and import', () => {
    const state = createState(doc);
    const result = reimport(buildExportHtml(state, theme, { extensions }));
    expect(result.ok && result.kind === 'embedded' && result.data.state.meta).toEqual(state.meta);
    expect(result.ok && result.kind === 'embedded' && result.data.state.revisions).toEqual(
      state.revisions,
    );
  });

  it('does not take the cover or revisions into the body when imported as external HTML', () => {
    const html = buildExportHtml(createState(doc), theme, { extensions });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    dom.getElementById('doc-data')?.remove();
    const imported = importDocument('external.html', dom.body.innerHTML);
    expect(imported.content?.map((n) => n.type)).toEqual(['toc', 'heading']);
  });
});

describe('buildExportHtml: header and footer', () => {
  const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
  const doc: DocRoot = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '本文' }] }],
  };
  const copyright = '© 2026 "サンプル" </style><script>alert(1)</script> \\';
  const state: DocumentState = {
    ...createState(doc),
    settingsOverride: { logoDataUri: LOGO, copyright },
  };
  const html = buildExportHtml(state, theme, { extensions });
  const dom = new DOMParser().parseFromString(html, 'text/html');

  it('outputs the header first and the footer last, once each', () => {
    const parts = [...(dom.querySelector('.doc')?.children ?? [])];
    expect(parts[0]?.matches('header.doc-header')).toBe(true);
    expect(parts.at(-1)?.matches('footer.doc-footer')).toBe(true);
    expect(dom.querySelectorAll('.doc-header, .doc-footer')).toHaveLength(2);
    expect(dom.querySelector('.doc-logo')?.getAttribute('src')).toBe(LOGO);
    expect(dom.querySelector('.doc-copyright')?.textContent).toBe(copyright);
  });

  it('puts the values into theme-vars without breaking the CSS or the page', () => {
    const vars = dom.querySelector('style#theme-vars')?.textContent ?? '';
    expect(vars.startsWith(':root{--header-logo:url("data:image/png;base64,')).toBe(true);
    expect(dom.querySelectorAll('script')).toHaveLength(1);
    expect(dom.querySelectorAll('style')).toHaveLength(2);
    const style = document.createElement('style');
    style.textContent = vars;
    document.head.append(style);
    expect(style.sheet?.cssRules).toHaveLength(1);
    style.remove();
  });

  it('falls back to the theme settings', () => {
    const themed: Theme = {
      ...theme,
      settings: { ...theme.settings, logoDataUri: LOGO, copyright: '© テーマ' },
    };
    const out = new DOMParser().parseFromString(
      buildExportHtml({ ...state, settingsOverride: undefined }, themed, { extensions }),
      'text/html',
    );
    expect(out.querySelector('.doc-copyright')?.textContent).toBe('© テーマ');
    expect(out.querySelector('.doc-logo')).not.toBeNull();
  });

  it('round trips the override and leaves header / footer out of an external import', () => {
    const result = reimport(html);
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
    dom.getElementById('doc-data')?.remove();
    const imported = importDocument('external.html', dom.body.innerHTML);
    expect(imported.content?.map((n) => n.type)).toEqual(['paragraph']);
  });
});

describe('buildExportHtml: page settings', () => {
  const doc: DocRoot = {
    type: 'doc',
    content: [
      {
        type: 'tableFigure',
        attrs: { id: 't-page0001', landscape: true },
        content: [
          { type: 'tableCaption', content: [{ type: 'text', text: '横向きの表' }] },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null },
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const state: DocumentState = {
    ...createState(doc),
    settingsOverride: {
      page: {
        size: 'custom',
        orientation: 'landscape',
        customMm: { width: 182, height: 257 },
        margin: 'narrow',
        baseFontPt: 9,
      },
    },
  };

  it('puts the base font size into theme-vars', () => {
    const html = buildExportHtml(state, theme, { extensions });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('style#theme-vars')?.textContent).toBe(':root{--base-font-size:9pt;}');
    const themed = buildExportHtml({ ...state, settingsOverride: undefined }, theme, {
      extensions,
    });
    expect(themed).toContain('--base-font-size:10.5pt;');
  });

  it('round trips the page settings and the landscape table', () => {
    const result = reimport(buildExportHtml(state, theme, { extensions }));
    expect(result.ok && result.kind === 'embedded' && result.data.state).toEqual(state);
    expect(buildExportHtml(state, theme, { extensions })).toContain(
      '<div class="table-figure is-landscape" id="t-page0001">',
    );
  });
});
