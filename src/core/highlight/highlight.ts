import bash from 'highlight.js/lib/languages/bash';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { createLowlight } from 'lowlight';
import { escapeHtml } from '../export/escape';
import { resolveCodeLanguage } from './languages';

/** lowlight instance with exactly the grammars of CODE_LANGUAGES. */
export const lowlight = createLowlight({
  bash,
  csharp,
  css,
  diff,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  sql,
  typescript,
  xml,
  yaml,
});

type HighlightRoot = ReturnType<typeof lowlight.highlight>;
type HighlightNode = HighlightRoot['children'][number];

/** A run of code text with the highlight classes that apply to it (outermost first). */
export interface HighlightToken {
  text: string;
  classes: readonly string[];
}

function classNamesOf(node: HighlightNode): string[] {
  if (node.type !== 'element') return [];
  const className = node.properties.className;
  return Array.isArray(className) ? className.map(String) : [];
}

function flatten(nodes: readonly HighlightNode[], classes: readonly string[]): HighlightToken[] {
  return nodes.flatMap((node): HighlightToken[] => {
    if (node.type === 'text') return [{ text: node.value, classes }];
    if (node.type === 'element') {
      return flatten(node.children, [...classes, ...classNamesOf(node)]);
    }
    return [];
  });
}

/**
 * Splits code into highlighted runs. Empty or unsupported languages give a single run
 * without classes (no auto-detection, design.md §5.7). The runs' text always adds up to
 * `code`, so they can be mapped to editor positions.
 */
export function highlightTokens(code: string, language: string | null | undefined): HighlightToken[] {
  const resolved = resolveCodeLanguage(language);
  if (!resolved || code === '') return code === '' ? [] : [{ text: code, classes: [] }];
  return flatten(lowlight.highlight(resolved.id, code).children, []);
}

/** Highlighted code as escaped HTML: `<span class="hljs-…">` runs and plain text. */
export function highlightCodeToHtml(code: string, language: string | null | undefined): string {
  return highlightTokens(code, language)
    .map(({ text, classes }) =>
      classes.length === 0
        ? escapeHtml(text)
        : `<span class="${escapeHtml(classes.join(' '))}">${escapeHtml(text)}</span>`,
    )
    .join('');
}
