import type { DocMeta, Revision } from '../model';
import {
  formatJapaneseDate,
  hasCover,
  renderCover,
  renderFooter,
  renderHeader,
  renderRevisions,
} from './templates';

const meta: DocMeta = {
  title: '基本設計書',
  projectName: '顧客管理システム構築',
  version: '1.0',
  date: '2026-10-01',
  companyName: '株式会社サンプル',
  clientName: '顧客株式会社',
};

function parse(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
}

describe('formatJapaneseDate', () => {
  it.each([
    ['2026-10-01', '2026年10月1日'],
    ['2026-01-31', '2026年1月31日'],
    ['not a date', 'not a date'],
  ])('%s -> %s', (input, expected) => {
    expect(formatJapaneseDate(input)).toBe(expected);
  });
});

describe('renderCover', () => {
  it('outputs every item with its contract class in order', () => {
    const cover = parse(renderCover(meta)).querySelector('section.doc-cover');
    expect(cover?.getAttribute('aria-label')).toBe('表紙');
    expect([...(cover?.children ?? [])].map((el) => [el.className, el.textContent])).toEqual([
      ['cover-client', '顧客株式会社 御中'],
      ['cover-project', '顧客管理システム構築'],
      ['cover-title', '基本設計書'],
      ['cover-version', '第1.0版'],
      ['cover-date', '2026年10月1日'],
      ['cover-company', '株式会社サンプル'],
    ]);
    expect(cover?.querySelector('h1.cover-title')).not.toBeNull();
  });

  it('leaves out empty items', () => {
    const cover = parse(
      renderCover({ ...meta, projectName: ' ', version: '', clientName: undefined }),
    ).querySelector('.doc-cover');
    expect([...(cover?.children ?? [])].map((el) => el.className)).toEqual([
      'cover-title',
      'cover-date',
      'cover-company',
    ]);
  });

  it('outputs nothing when only the date is set', () => {
    const empty: DocMeta = {
      title: '',
      projectName: '',
      version: '1.0',
      date: meta.date,
      companyName: '',
    };
    expect(hasCover(empty)).toBe(false);
    expect(renderCover(empty)).toBe('');
    expect(hasCover({ ...empty, clientName: '顧客' })).toBe(true);
  });

  it('escapes the text', () => {
    const html = renderCover({ ...meta, title: '<script>alert(1)</script> & "A"' });
    const cover = parse(html);
    expect(cover.querySelector('script')).toBeNull();
    expect(cover.querySelector('.cover-title')?.textContent).toBe(
      '<script>alert(1)</script> & "A"',
    );
  });
});

describe('renderRevisions', () => {
  const revisions: Revision[] = [
    { id: 'r-1', version: '1.0', date: '2026-09-01', description: '初版', author: '山田' },
    {
      id: 'r-2',
      version: '1.1',
      date: '2026-10-01',
      description: '2章を修正\n<b>表1</b>を追加',
      author: '佐藤',
    },
  ];

  it('outputs a table with a header row and one row per revision, in order', () => {
    const section = parse(renderRevisions(revisions)).querySelector('section.doc-revisions');
    expect(section?.querySelector('h2')?.textContent).toBe('改訂履歴');
    expect([...(section?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent)).toEqual([
      '版',
      '日付',
      '内容',
      '担当',
    ]);
    const rows = [...(section?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
      [...tr.children].map((td) => td.innerHTML),
    );
    expect(rows).toEqual([
      ['1.0', '2026年9月1日', '初版', '山田'],
      ['1.1', '2026年10月1日', '2章を修正<br>&lt;b&gt;表1&lt;/b&gt;を追加', '佐藤'],
    ]);
  });

  it('outputs nothing without revisions', () => {
    expect(renderRevisions([])).toBe('');
  });
});

describe('renderHeader / renderFooter', () => {
  const logo = 'data:image/png;base64,iVBORw0KGgo=';

  it('outputs the logo in the header and the copyright in the footer', () => {
    const header = parse(renderHeader({ logoDataUri: logo })).querySelector('header.doc-header');
    expect(header?.querySelector('img.doc-logo')?.getAttribute('src')).toBe(logo);
    const footer = parse(renderFooter({ copyright: '© 2026 "A&B"' })).querySelector(
      'footer.doc-footer',
    );
    expect(footer?.querySelector('.doc-copyright')?.textContent).toBe('© 2026 "A&B"');
  });

  it('outputs nothing without values', () => {
    expect(renderHeader({})).toBe('');
    expect(renderFooter({ copyright: '  ' })).toBe('');
  });

  it('cannot break out of the src attribute', () => {
    const header = parse(renderHeader({ logoDataUri: 'data:image/png,"><script>x</script>' }));
    expect(header.querySelector('script')).toBeNull();
    expect(header.querySelectorAll('header > *')).toHaveLength(1);
  });
});
