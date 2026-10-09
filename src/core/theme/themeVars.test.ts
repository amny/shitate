import { escapeCssString } from '../export/escape';
import type { ThemeSettings } from '../model';
import { DEFAULT_PAGE_SETTINGS } from '../model';
import { buildThemeVars, overridesHeaderFooter, resolveHeaderFooter } from './themeVars';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const theme: ThemeSettings = {
  tocDepth: 3,
  page: { ...DEFAULT_PAGE_SETTINGS },
  logoDataUri: LOGO,
  copyright: '© 2026 テーマ社',
};

/** Reads a custom property back through the browser's CSS parser. */
function parsedVar(css: string, name: string): string {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  try {
    const rule = style.sheet?.cssRules[0];
    return rule instanceof CSSStyleRule ? rule.style.getPropertyValue(name).trim() : '';
  } finally {
    style.remove();
  }
}

describe('escapeCssString', () => {
  it.each([
    ['plain', 'plain'],
    ['say "hi"', 'say \\"hi\\"'],
    ['back\\slash', 'back\\\\slash'],
    ['line\nbreak', 'line\\a break'],
    ['tab\there', 'tab\\9 here'],
  ])('%j -> %j', (input, expected) => {
    expect(escapeCssString(input)).toBe(expected);
  });
});

describe('buildThemeVars', () => {
  it('outputs the logo and the copyright as CSS variables', () => {
    expect(buildThemeVars({ logoDataUri: LOGO, copyright: '© 2026 A社' })).toBe(
      `:root{--header-logo:url("${LOGO}");--copyright:"© 2026 A社";}`,
    );
  });

  it('outputs the base font size of the page settings', () => {
    expect(buildThemeVars({ baseFontPt: 9.5 })).toBe(':root{--base-font-size:9.5pt;}');
    expect(buildThemeVars({ copyright: 'A', baseFontPt: 12 })).toBe(
      ':root{--copyright:"A";--base-font-size:12pt;}',
    );
    expect(buildThemeVars({ baseFontPt: Number.NaN })).toBe(':root{}');
  });

  it('leaves out variables without a value', () => {
    expect(buildThemeVars({})).toBe(':root{}');
    expect(buildThemeVars({ copyright: '' })).toBe(':root{}');
  });

  it('keeps the declaration intact with quotes, backslashes and line breaks', () => {
    const copyright = '© 2026 "A\\B"; } body { color: red\n社';
    const css = buildThemeVars({ copyright });
    expect(css).not.toContain('\n');
    // Exactly one rule with exactly the one variable: nothing escaped out of the string.
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    expect(style.sheet?.cssRules).toHaveLength(1);
    style.remove();
    expect(parsedVar(css, '--copyright')).toContain('A\\\\B');
  });
});

describe('resolveHeaderFooter', () => {
  it('uses the theme settings without an override', () => {
    expect(resolveHeaderFooter(theme, undefined)).toEqual({
      logoDataUri: LOGO,
      copyright: '© 2026 テーマ社',
    });
    expect(overridesHeaderFooter(undefined)).toBe(false);
    expect(overridesHeaderFooter({ tocDepth: 2 })).toBe(false);
  });

  it('takes each item from the override when it has one', () => {
    const logo = 'data:image/svg+xml;base64,PHN2Zz4=';
    expect(resolveHeaderFooter(theme, { logoDataUri: logo })).toEqual({
      logoDataUri: logo,
      copyright: '© 2026 テーマ社',
    });
    expect(resolveHeaderFooter(theme, { copyright: '' })).toEqual({
      logoDataUri: LOGO,
      copyright: '',
    });
    expect(overridesHeaderFooter({ copyright: '' })).toBe(true);
  });
});
