import type { Theme } from '../model';
import { BUILTIN_THEMES, getBuiltinTheme } from './builtinThemes';
import { createEditableTheme, newThemeId, parseStoredThemes, resetThemeCss } from './editing';

function builtin(id: string): Theme {
  const theme = getBuiltinTheme(id);
  if (!theme) throw new Error(`no built-in ${id}`);
  return theme;
}

describe('createEditableTheme', () => {
  it('copies a built-in into a new user theme and leaves the built-in unchanged', () => {
    const standard = builtin('standard');
    const before = structuredClone(standard);
    const copy = createEditableTheme(standard, () => 'theme-abcd1234');

    expect(copy).toEqual({
      ...before,
      id: 'theme-abcd1234',
      name: '標準（編集）',
      builtIn: false,
      baseId: 'standard',
    });
    copy.css = '.doc { color: red; }';
    copy.settings.page.size = 'A3';
    expect(standard).toEqual(before);
    expect(Object.isFrozen(BUILTIN_THEMES)).toBe(true);
  });

  it('edits a user theme under its own ID, as a copy', () => {
    const user: Theme = { ...builtin('simple'), id: 'theme-user0001', builtIn: false, name: 'A' };
    const editable = createEditableTheme(user);
    expect(editable).toEqual(user);
    expect(editable).not.toBe(user);
    expect(editable.settings).not.toBe(user.settings);
  });

  it('copies an embedded old version of a built-in instead of overwriting the built-in', () => {
    const embedded: Theme = { ...builtin('standard'), css: '.doc { color: blue; }' };
    const editable = createEditableTheme(embedded, () => 'theme-x');
    expect(editable).toMatchObject({ id: 'theme-x', baseId: 'standard', builtIn: false });
    expect(editable.css).toBe('.doc { color: blue; }');
  });
});

describe('resetThemeCss', () => {
  it("goes back to the base built-in's CSS and keeps the settings", () => {
    const edited: Theme = {
      ...createEditableTheme(builtin('simple')),
      css: '.doc { color: red; }',
      settings: { ...builtin('simple').settings, copyright: '© A' },
    };
    const reset = resetThemeCss(edited);
    expect(reset?.css).toBe(builtin('simple').css);
    expect(reset?.settings.copyright).toBe('© A');
    expect(reset?.id).toBe(edited.id);
  });

  it('is not available without a base', () => {
    const user: Theme = { ...builtin('simple'), id: 'theme-1', builtIn: false };
    expect(resetThemeCss(user)).toBeNull();
    expect(resetThemeCss({ ...user, baseId: 'missing' })).toBeNull();
  });
});

describe('newThemeId', () => {
  it('makes unique IDs in the theme- form', () => {
    const ids = new Set(Array.from({ length: 50 }, newThemeId));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^theme-[0-9a-z]{8}$/);
  });
});

describe('parseStoredThemes', () => {
  const user = (id: string, name: string): Theme => ({
    ...builtin('standard'),
    id,
    name,
    builtIn: false,
    baseId: 'standard',
  });

  it('keeps valid user themes sorted by name and counts the rest', () => {
    const result = parseStoredThemes([
      user('theme-2', 'い'),
      { id: 'broken' },
      user('theme-1', 'あ'),
      builtin('simple'),
      { ...user('standard', '偽'), builtIn: false },
    ]);
    expect(result.themes.map((t) => t.id)).toEqual(['theme-1', 'theme-2']);
    expect(result.invalid).toBe(3);
  });
});
