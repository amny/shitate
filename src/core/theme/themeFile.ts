import { z } from 'zod';
import { themeSchema } from '../model';
import type { Theme } from '../model';
import { getBuiltinTheme } from './builtinThemes';
import { checkThemeContract, formatViolationForUser } from './contract';
import { newThemeId } from './editing';

/** Theme file (design.md §8.4): one theme wrapped with a format name and a version. */
export const THEME_FILE_FORMAT = 'shitate-theme';
export const THEME_FILE_VERSION = 1;
export const THEME_FILE_EXTENSION = '.theme.json';

const themeFileHeaderSchema = z.looseObject({ format: z.string(), version: z.unknown() });
const themeFileSchema = z.object({
  format: z.literal(THEME_FILE_FORMAT),
  version: z.literal(THEME_FILE_VERSION),
  theme: themeSchema,
});

const INVALID_FILE_NAME_CHARS = '\\/:*?"<>|';

function safeFileNameChar(char: string): string {
  return INVALID_FILE_NAME_CHARS.includes(char) || char.charCodeAt(0) < 0x20 ? '_' : char;
}

export function serializeThemeFile(theme: Theme): string {
  return `${JSON.stringify({ format: THEME_FILE_FORMAT, version: THEME_FILE_VERSION, theme }, null, 2)}\n`;
}

/** `テーマ名.theme.json`, with characters invalid on Windows / macOS replaced by "_". */
export function themeFileName(theme: Theme): string {
  const base = Array.from(theme.name.trim(), safeFileNameChar).join('') || 'テーマ';
  return `${base}${THEME_FILE_EXTENSION}`;
}

export type ThemeFileResult = { ok: true; theme: Theme } | { ok: false; error: string };

/** Reads a theme file; the theme must also follow the theme contract. */
export function parseThemeFile(text: string): ThemeFileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    return {
      ok: false,
      error: `JSONとして読み込めません（${error instanceof Error ? error.message : String(error)}）`,
    };
  }
  const header = themeFileHeaderSchema.safeParse(parsed);
  if (!header.success || header.data.format !== THEME_FILE_FORMAT) {
    return { ok: false, error: 'テーマのファイルではありません' };
  }
  if (header.data.version !== THEME_FILE_VERSION) {
    return {
      ok: false,
      error: `対応していない版のテーマファイルです（version: ${String(header.data.version)}）`,
    };
  }
  const file = themeFileSchema.safeParse(parsed);
  if (!file.success) {
    const issue = file.error.issues[0];
    const where = issue ? issue.path.join('.') : '';
    return {
      ok: false,
      error: `テーマの内容が正しくありません（${where}: ${issue?.message ?? ''}）`,
    };
  }
  const violations = checkThemeContract(file.data.theme.css);
  if (violations.length > 0) {
    const shown = violations.slice(0, 3).map(formatViolationForUser).join(' / ');
    const more = violations.length > 3 ? ` ほか${String(violations.length - 3)}件` : '';
    return { ok: false, error: `テーマ契約に合わないため読み込めません：${shown}${more}` };
  }
  return { ok: true, theme: file.data.theme };
}

/** JSON with object keys sorted, so equal themes compare equal whatever their key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function sameContent(a: Theme, b: Theme): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export type ImportPlan = { kind: 'add'; theme: Theme } | { kind: 'exists'; theme: Theme };

/**
 * How an imported theme is added (design.md §8.4): an identical theme is not added twice, a
 * different theme with a used ID (or a built-in) gets a new ID, and an unknown `baseId` is
 * dropped. Local themes are never overwritten.
 */
export function planThemeImport(
  imported: Theme,
  userThemes: readonly Theme[],
  createId: () => string = newThemeId,
): ImportPlan {
  const { baseId: _baseId, ...withoutBase } = imported;
  let theme: Theme = withoutBase;
  const base = imported.builtIn ? imported.id : imported.baseId;
  if (base !== undefined && getBuiltinTheme(base)) {
    theme = { ...theme, baseId: base };
  }
  theme = { ...theme, builtIn: false };

  const existing = userThemes.find((t) => t.id === theme.id);
  if (existing && sameContent(existing, theme)) {
    return { kind: 'exists', theme: existing };
  }
  if (existing || imported.builtIn || getBuiltinTheme(theme.id)) {
    theme = { ...theme, id: createId() };
  }
  return { kind: 'add', theme };
}

/** "標準のコピー", or "標準のコピー 2", 3, … when the name is taken. */
export function copyName(name: string, takenNames: readonly string[]): string {
  const base = `${name}のコピー`;
  if (!takenNames.includes(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${String(n)}`;
    if (!takenNames.includes(candidate)) return candidate;
  }
}

/** A new user theme with the same CSS and settings (design.md §8.4: 複製). */
export function duplicateTheme(
  theme: Theme,
  takenNames: readonly string[],
  createId: () => string = newThemeId,
): Theme {
  const copy = structuredClone(theme);
  const base = theme.builtIn ? theme.id : theme.baseId;
  const { baseId: _baseId, ...rest } = copy;
  return {
    ...rest,
    ...(base === undefined ? {} : { baseId: base }),
    id: createId(),
    name: copyName(theme.name, takenNames),
    builtIn: false,
  };
}
