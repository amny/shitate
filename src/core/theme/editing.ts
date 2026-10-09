import { customAlphabet } from 'nanoid';
import { themeSchema } from '../model';
import type { Theme } from '../model';
import { getBuiltinTheme } from './builtinThemes';

const randomId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8);

/** ID for a new user theme: `theme-` + 8 lower-case letters / digits. */
export function newThemeId(): string {
  return `theme-${randomId()}`;
}

function copyTheme(theme: Theme): Theme {
  return structuredClone(theme);
}

/**
 * The theme to edit (design.md §8.4). A built-in is never edited itself: it becomes a new user
 * theme with `baseId` pointing at it. Other themes are edited as they are (same ID).
 */
export function createEditableTheme(theme: Theme, createId: () => string = newThemeId): Theme {
  if (!theme.builtIn) {
    return copyTheme(theme);
  }
  const copy = copyTheme(theme);
  return {
    ...copy,
    id: createId(),
    name: `${theme.name}（編集）`,
    builtIn: false,
    baseId: theme.id,
  };
}

/** The built-in a theme was made from, when it still exists. */
export function baseThemeOf(theme: Theme): Theme | undefined {
  return theme.baseId === undefined ? undefined : getBuiltinTheme(theme.baseId);
}

/** "初期状態に戻す": the theme with its base built-in's CSS (settings are kept), or null. */
export function resetThemeCss(theme: Theme): Theme | null {
  const base = baseThemeOf(theme);
  return base ? { ...theme, css: base.css } : null;
}

export interface StoredThemes {
  themes: Theme[];
  /** Number of stored values that are not valid themes (skipped). */
  invalid: number;
}

/**
 * Validates user themes read from storage (design.md §8.4): invalid values and built-in
 * IDs are skipped, sorted by name.
 */
export function parseStoredThemes(values: readonly unknown[]): StoredThemes {
  const themes: Theme[] = [];
  let invalid = 0;
  for (const value of values) {
    const parsed = themeSchema.safeParse(value);
    if (parsed.success && !parsed.data.builtIn && !getBuiltinTheme(parsed.data.id)) {
      themes.push(parsed.data);
    } else {
      invalid++;
    }
  }
  themes.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return { themes, invalid };
}
