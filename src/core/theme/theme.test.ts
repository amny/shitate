import {
  BUILTIN_THEMES,
  getBuiltinTheme,
  getDefaultTheme,
  isCurrentBuiltin,
} from './builtinThemes';
import {
  checkThemeContract,
  findThemeContractViolations,
  formatViolationForUser,
} from './contract';
import { themeSchema } from '../model';

describe('built-in themes', () => {
  it('registers standard and simple as valid built-in themes', () => {
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual(['standard', 'simple']);
    for (const theme of BUILTIN_THEMES) {
      expect(themeSchema.safeParse(theme).success).toBe(true);
      expect(theme.builtIn).toBe(true);
      expect(theme.css.length).toBeGreaterThan(100);
    }
    expect(getDefaultTheme().id).toBe('standard');
  });

  it.each(BUILTIN_THEMES.map((theme) => [theme.id, theme.css]))(
    '%s follows the theme contract',
    (_id, css) => {
      expect(findThemeContractViolations(css)).toEqual([]);
    },
  );

  it('tells built-ins from modified copies', () => {
    const standard = getBuiltinTheme('standard');
    expect(standard && isCurrentBuiltin(standard)).toBe(true);
    expect(standard && isCurrentBuiltin({ ...standard, css: `${standard.css}\n` })).toBe(false);
    expect(standard && isCurrentBuiltin({ ...standard, id: 'customer' })).toBe(false);
  });
});

describe('findThemeContractViolations', () => {
  it('accepts scoped rules, media queries and @page margin boxes', () => {
    const css = `
      .doc { font-size: var(--base-font-size, 10.5pt); --accent: #333; color: var(--accent); }
      .doc .doc-body h1, .doc.is-landscape > .table-figure { color: red; }
      @media print { .doc .xref { color: black; } }
      @page { @top-left { content: var(--header-logo); } }
      @page :first { @top-left { content: none; } }
      .doc .doc-body .hljs-keyword, .doc .doc-body .hljs-built_in { color: blue; }
    `;
    expect(findThemeContractViolations(css)).toEqual([]);
  });

  it.each([
    ['unscoped selector', 'h1 { color: red; }', 'not scoped under .doc'],
    ['look-alike root class', '.document h1 { color: red; }', 'not scoped under .doc'],
    ['body selector', 'body .doc { margin: 0; }', 'not scoped under .doc'],
    ['unknown class', '.doc .my-class { color: red; }', 'class not in the theme contract'],
    ['editor class', '.doc .ProseMirror { color: red; }', 'class not in the theme contract'],
    ['hljs root class', '.doc .hljs { color: red; }', 'class not in the theme contract'],
    ['@page size', '@page { size: A4; }', '@page must not set "size"'],
    ['@page margin', '@page { margin-top: 10mm; }', '@page must not set "margin-top"'],
    ['@import', '@import url("https://example.com/a.css");', 'unsupported at-rule'],
    ['@font-face', '@font-face { font-family: X; src: url(x.woff2); }', 'unsupported at-rule'],
    ['unknown variable', '.doc { color: var(--brand); }', 'CSS variable not in the theme contract'],
  ])('rejects %s', (_label, css, message) => {
    expect(findThemeContractViolations(css).join('\n')).toContain(message);
  });

  it('ignores comments', () => {
    expect(findThemeContractViolations('/* h1 { } .x { } */ .doc { color: red; }')).toEqual([]);
  });
});

describe('checkThemeContract / formatViolationForUser', () => {
  it('reports each kind of violation as data with a Japanese message', () => {
    const violations = checkThemeContract(
      [
        'body { margin: 0; }',
        '.doc .x { color: red; }',
        '@page { size: A4; }',
        '@import url(a.css);',
        '.doc { color: var(--brand); }',
      ].join('\n'),
    );
    expect(violations.map((v) => v.kind)).toEqual([
      'unscoped-selector',
      'unknown-class',
      'page-descriptor',
      'unsupported-at-rule',
      'unknown-variable',
    ]);
    expect(violations.map(formatViolationForUser)).toEqual([
      '「body」は .doc で始まっていません。すべてのルールは .doc の下に書いてください',
      '「.doc .x」の .x は使えるクラスにありません',
      '@page に「size」は書けません（ページ設定から生成されます）',
      '「@import url(a.css)」は使えません（使えるのは @media / @supports / @page）',
      'CSS変数「--brand」は使えません（テーマ内で定義した変数は使えます）',
    ]);
  });
});
