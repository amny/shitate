import MarkdownIt from 'markdown-it';

// GFM tables and strikethrough are enabled in the default preset.
// Raw HTML is allowed here because the result is sanitized like external HTML.
const markdown = new MarkdownIt({ html: true, linkify: true });

export function markdownToHtml(source: string): string {
  return markdown.render(source);
}
