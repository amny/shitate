/** A language that code blocks can be highlighted in (design.md §5.7). */
export interface CodeLanguage {
  /** The value stored in `codeBlock.language` when chosen in the editor. */
  id: string;
  /** Name shown in the language picker. */
  label: string;
  /** Other names accepted for `codeBlock.language` (Markdown fences, pasted HTML). */
  aliases: readonly string[];
}

/** Supported languages, in picker order. Each `id` matches a highlight.js grammar name. */
export const CODE_LANGUAGES: readonly CodeLanguage[] = [
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'cjs'] },
  { id: 'json', label: 'JSON', aliases: ['jsonc'] },
  { id: 'xml', label: 'HTML / XML', aliases: ['html', 'xhtml', 'svg'] },
  { id: 'css', label: 'CSS', aliases: [] },
  { id: 'sql', label: 'SQL', aliases: [] },
  { id: 'bash', label: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  { id: 'python', label: 'Python', aliases: ['py'] },
  { id: 'java', label: 'Java', aliases: ['jsp'] },
  { id: 'csharp', label: 'C#', aliases: ['cs', 'c#'] },
  { id: 'go', label: 'Go', aliases: ['golang'] },
  { id: 'php', label: 'PHP', aliases: [] },
  { id: 'yaml', label: 'YAML', aliases: ['yml'] },
  { id: 'markdown', label: 'Markdown', aliases: ['md'] },
  { id: 'diff', label: 'Diff', aliases: ['patch'] },
];

const LANGUAGE_BY_NAME: ReadonlyMap<string, CodeLanguage> = new Map(
  CODE_LANGUAGES.flatMap((language) =>
    [language.id, ...language.aliases].map((name) => [name, language] as const),
  ),
);

/**
 * The supported language a `codeBlock.language` value names (id or alias, any case), or
 * null when it is empty or not supported. Unsupported values are kept in the document but
 * not highlighted; there is no auto-detection.
 */
export function resolveCodeLanguage(language: string | null | undefined): CodeLanguage | null {
  if (!language) return null;
  return LANGUAGE_BY_NAME.get(language.trim().toLowerCase()) ?? null;
}
