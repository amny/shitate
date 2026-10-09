import { highlightCodeToHtml, resolveCodeLanguage } from '../highlight';

/**
 * A code block as rendered by the codeBlock extension: `<pre><code class="language-x">`.
 * Its content is text only (no marks), so it has no tags, and `</code>` cannot appear in it.
 */
const CODE_BLOCK_PATTERN = /<pre><code(?: class="([^"]*)")?>([^<]*)<\/code><\/pre>/g;

const LANGUAGE_CLASS_PREFIX = 'language-';

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes the character references an HTML serializer (innerHTML) writes in text and attributes. */
export function decodeHtmlText(html: string): string {
  return html.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, dec, hex, name) => {
    if (typeof dec === 'string') return String.fromCodePoint(Number.parseInt(dec, 10));
    if (typeof hex === 'string') return String.fromCodePoint(Number.parseInt(hex, 16));
    return NAMED_ENTITIES[String(name).toLowerCase()] ?? entity;
  });
}

/**
 * Adds syntax highlighting to the code blocks of rendered body HTML (design.md §7.1):
 * the code is replaced by `<span class="hljs-…">` runs, the same runs the editor shows as
 * decorations. Blocks without a supported language are left as they are.
 */
export function highlightCodeBlocks(html: string): string {
  return html.replace(CODE_BLOCK_PATTERN, (block, classAttr: string | undefined, content: string) => {
    const language = decodeHtmlText(classAttr ?? '')
      .split(/\s+/)
      .find((name) => name.startsWith(LANGUAGE_CLASS_PREFIX))
      ?.slice(LANGUAGE_CLASS_PREFIX.length);
    if (!resolveCodeLanguage(language)) return block;
    const highlighted = highlightCodeToHtml(decodeHtmlText(content), language ?? null);
    return `<pre><code class="${classAttr ?? ''}">${highlighted}</code></pre>`;
  });
}
