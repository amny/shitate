import simpleCss from '../../themes/simple.css?raw';
import standardCss from '../../themes/standard.css?raw';
import { DEFAULT_PAGE_SETTINGS } from '../model';
import type { Theme } from '../model';

export const DEFAULT_THEME_ID = 'standard';

function builtin(id: string, name: string, css: string): Theme {
  return {
    id,
    name,
    builtIn: true,
    css,
    settings: { tocDepth: 3, page: { ...DEFAULT_PAGE_SETTINGS } },
  };
}

/** Built-in themes (design.md §8.3), loaded from src/themes/*.css at build time. */
export const BUILTIN_THEMES: readonly Theme[] = Object.freeze([
  builtin(DEFAULT_THEME_ID, '標準', standardCss),
  builtin('simple', 'シンプル', simpleCss),
]);

/** One-line descriptions for the theme picker (not part of the Theme data). */
export const BUILTIN_THEME_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [DEFAULT_THEME_ID]: '明朝見出し・ゴシック本文',
  simple: 'ゴシックのみ・罫線少なめ',
};

export function getBuiltinTheme(id: string): Theme | undefined {
  return BUILTIN_THEMES.find((theme) => theme.id === id);
}

/** True when the theme is exactly a current built-in (same id and CSS). */
export function isCurrentBuiltin(theme: Theme): boolean {
  return getBuiltinTheme(theme.id)?.css === theme.css;
}

export function getDefaultTheme(): Theme {
  const theme = getBuiltinTheme(DEFAULT_THEME_ID);
  if (!theme) {
    throw new Error(`Built-in theme "${DEFAULT_THEME_ID}" is missing`);
  }
  return theme;
}
