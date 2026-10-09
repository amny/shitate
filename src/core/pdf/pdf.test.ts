import { DEFAULT_PAGE_SETTINGS } from '../model';
import type { PageSettings, ThemeSettings } from '../model';
import { findThemeContractViolations } from '../theme/contract';
import { BUILTIN_THEMES } from '../theme/builtinThemes';
import { PDF_BASE_CSS } from './baseCss';
import { buildPageCss, resolvePageSettings } from './pageCss';

const page = (patch: Partial<PageSettings>): PageSettings => ({
  ...DEFAULT_PAGE_SETTINGS,
  ...patch,
});

describe('buildPageCss', () => {
  it('writes A4 portrait with the normal margin and the base font size by default', () => {
    expect(buildPageCss(page({}))).toBe(
      [
        '@page { size: 210mm 297mm; margin: 20mm 18mm; }',
        '@page landscape { size: 297mm 210mm; }',
        '.doc { --base-font-size: 10.5pt; }',
        '.doc .doc-body .table-figure.is-landscape { page: landscape; }',
      ].join('\n'),
    );
  });

  it.each([
    [page({ size: 'A3', orientation: 'landscape' }), '420mm 297mm', '420mm 297mm'],
    [page({ size: 'B4' }), '257mm 364mm', '364mm 257mm'],
    [page({ size: 'custom', customMm: { width: 300, height: 180 } }), '180mm 300mm', '300mm 180mm'],
    [
      page({ size: 'custom', orientation: 'landscape', customMm: { width: 182, height: 257 } }),
      '257mm 182mm',
      '257mm 182mm',
    ],
  ])('sizes %j', (settings, main, landscape) => {
    const css = buildPageCss(settings);
    expect(css).toContain(`@page { size: ${main};`);
    expect(css).toContain(`@page landscape { size: ${landscape}; }`);
  });

  it.each([
    ['narrow', '12mm'],
    ['wide', '25mm'],
  ] as const)('uses the %s margin', (margin, value) => {
    expect(buildPageCss(page({ margin, baseFontPt: 9 }))).toContain(`margin: ${value}; }`);
    expect(buildPageCss(page({ margin, baseFontPt: 9 }))).toContain('--base-font-size: 9pt;');
  });
});

describe('resolvePageSettings', () => {
  const theme: ThemeSettings = { tocDepth: 3, page: page({ size: 'A3' }) };

  it('applies the defaults through the built-in themes (A4 portrait, normal, 10.5pt)', () => {
    for (const builtin of BUILTIN_THEMES) {
      expect(resolvePageSettings(builtin.settings, undefined)).toEqual(DEFAULT_PAGE_SETTINGS);
      expect(buildPageCss(resolvePageSettings(builtin.settings, {}))).toContain(
        '@page { size: 210mm 297mm; margin: 20mm 18mm; }',
      );
    }
  });

  it('prefers the document override over the theme', () => {
    expect(resolvePageSettings(theme, undefined).size).toBe('A3');
    expect(resolvePageSettings(theme, { page: page({ size: 'B4' }) }).size).toBe('B4');
    // Other overrides do not affect the page settings.
    expect(resolvePageSettings(theme, { tocDepth: 1, copyright: 'x' }).size).toBe('A3');
  });
});

describe('PDF_BASE_CSS', () => {
  it('stays within the theme contract (only contract classes, no @page size)', () => {
    expect(findThemeContractViolations(PDF_BASE_CSS)).toEqual([]);
  });

  it('puts page numbers into the TOC and hides the browser header / footer', () => {
    expect(PDF_BASE_CSS).toContain('target-counter(attr(href url), page)');
    expect(PDF_BASE_CSS).toMatch(/\.doc-header,\s*\.doc \.doc-footer \{\s*display: none;/);
    expect(PDF_BASE_CSS).toMatch(/\.doc-toc \{\s*break-after: page;/);
  });

  it('does not keep whole tables together (S-1: empty page before long tables)', () => {
    expect(PDF_BASE_CSS).not.toMatch(/\.table-figure\s*\{[^}]*break-inside/);
  });
});

describe('built-in themes: PDF rules', () => {
  it.each(BUILTIN_THEMES.map((theme) => [theme.id, theme.css]))(
    '%s places logo, running head, copyright and page number, and clears them on the cover',
    (_id, css) => {
      // The logo is a scaled background (content: url() would keep the image's own size).
      expect(css).toMatch(
        /@top-left \{[^}]*background-image: var\(--header-logo\);[^}]*background-size: auto 8mm;/,
      );
      expect(css).toMatch(/@top-right\s*\{\s*content: string\(chapter\)/);
      expect(css).toMatch(/@bottom-left\s*\{\s*content: var\(--copyright\)/);
      expect(css).toContain("content: counter(page) ' / ' counter(pages);");
      expect(css).toMatch(/@page :first \{(\s*@[a-z-]+ \{\s*content: none;\s*\})+\s*\}/);
      expect(css).toContain('string-set: chapter content(text);');
    },
  );
});
