import type { Theme } from '../model';
import { getBuiltinTheme } from './builtinThemes';
import {
  copyName,
  duplicateTheme,
  parseThemeFile,
  planThemeImport,
  serializeThemeFile,
  themeFileName,
} from './themeFile';

function builtin(id: string): Theme {
  const theme = getBuiltinTheme(id);
  if (!theme) throw new Error(`no built-in ${id}`);
  return theme;
}

const user: Theme = {
  ...builtin('standard'),
  id: 'theme-user0001',
  name: '顧客A様向け',
  builtIn: false,
  baseId: 'standard',
  css: `${builtin('standard').css}\n.doc .doc-body p { color: #c00; }`,
  settings: {
    ...builtin('standard').settings,
    copyright: '© 2026 "A"',
    logoDataUri: 'data:image/png;base64,iVBORw0KGgo=',
  },
};

describe('theme file', () => {
  it('round trips a theme', () => {
    const text = serializeThemeFile(user);
    expect(JSON.parse(text)).toMatchObject({ format: 'shitate-theme', version: 1 });
    expect(parseThemeFile(text)).toEqual({ ok: true, theme: user });
  });

  it('names the file after the theme', () => {
    expect(themeFileName(user)).toBe('顧客A様向け.theme.json');
    expect(themeFileName({ ...user, name: 'a/b:c' })).toBe('a_b_c.theme.json');
    expect(themeFileName({ ...user, name: '  ' })).toBe('テーマ.theme.json');
  });

  it.each([
    ['broken JSON', '{', 'JSONとして読み込めません'],
    ['another JSON', '{"type":"doc"}', 'テーマのファイルではありません'],
    [
      'an embedded document',
      '{"format":"tiptap-spec-doc","version":1}',
      'テーマのファイルではありません',
    ],
    ['a newer version', '{"format":"shitate-theme","version":2}', '対応していない版'],
    [
      'an invalid theme',
      JSON.stringify({ format: 'shitate-theme', version: 1, theme: { ...user, css: 1 } }),
      'テーマの内容が正しくありません（theme.css',
    ],
  ])('rejects %s', (_label, text, message) => {
    const result = parseThemeFile(text);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain(message);
  });

  it('rejects CSS outside the theme contract', () => {
    const result = parseThemeFile(serializeThemeFile({ ...user, css: 'body { display: none; }' }));
    expect(result.ok ? '' : result.error).toContain(
      'テーマ契約に合わないため読み込めません：「body」は .doc で始まっていません',
    );
  });
});

describe('planThemeImport', () => {
  it('adds a new theme as it is', () => {
    expect(planThemeImport(user, [])).toEqual({ kind: 'add', theme: user });
  });

  it('does not add an identical theme twice', () => {
    expect(planThemeImport(user, [user])).toEqual({ kind: 'exists', theme: user });
    // Also when the stored object has its keys in another order.
    const reordered = Object.fromEntries(Object.entries(user).reverse()) as Theme;
    expect(planThemeImport(user, [reordered]).kind).toBe('exists');
  });

  it('gives a different theme with a used ID a new ID instead of overwriting', () => {
    const changed = { ...user, css: '.doc { color: blue; }' };
    const plan = planThemeImport(changed, [user], () => 'theme-new00001');
    expect(plan).toEqual({ kind: 'add', theme: { ...changed, id: 'theme-new00001' } });
  });

  it('adds an exported built-in as a user copy based on it', () => {
    const plan = planThemeImport(builtin('simple'), [], () => 'theme-new00002');
    expect(plan.theme).toMatchObject({ id: 'theme-new00002', builtIn: false, baseId: 'simple' });
    expect(plan.theme.css).toBe(builtin('simple').css);
  });

  it('drops a baseId that is not a built-in here', () => {
    const plan = planThemeImport({ ...user, baseId: 'from-elsewhere' }, []);
    expect(plan.theme).not.toHaveProperty('baseId');
  });
});

describe('duplicateTheme', () => {
  it('copies a built-in into a user theme based on it', () => {
    const copy = duplicateTheme(builtin('standard'), [], () => 'theme-copy0001');
    expect(copy).toEqual({
      ...builtin('standard'),
      id: 'theme-copy0001',
      name: '標準のコピー',
      builtIn: false,
      baseId: 'standard',
    });
  });

  it("keeps a user theme's base and settings, with a free name", () => {
    const copy = duplicateTheme(user, ['顧客A様向けのコピー'], () => 'theme-copy0002');
    expect(copy).toEqual({ ...user, id: 'theme-copy0002', name: '顧客A様向けのコピー 2' });
    expect(copy.settings).not.toBe(user.settings);
  });

  it('numbers copies', () => {
    expect(copyName('A', ['Aのコピー', 'Aのコピー 2'])).toBe('Aのコピー 3');
  });
});
