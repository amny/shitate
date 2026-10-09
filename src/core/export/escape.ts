const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/**
 * Serializes a value for <script type="application/json">.
 * Escaping every "<" prevents both "</script>" and "<!--" from ending the block early;
 * JSON.parse turns "<" back into "<".
 */
export function serializeJsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Prevents "</style" inside CSS from closing the <style> element. */
export function escapeStyleContent(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1');
}

/**
 * Escapes text for a double-quoted CSS string ("…" or url("…")): backslash, quote, line
 * breaks and other control characters become CSS escapes, so the value cannot end the
 * string or the declaration (design.md §7.2).
 */
export function escapeCssString(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\\"\u0000-\u001f\u007f]/g, (char) =>
    char === '\\' || char === '"' ? `\\${char}` : `\\${char.charCodeAt(0).toString(16)} `,
  );
}
