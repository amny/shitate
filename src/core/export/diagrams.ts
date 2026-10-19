import { isMermaidLanguage } from '../diagram';
import { CODE_BLOCK_PATTERN, codeBlockLanguage } from './highlightCode';

/**
 * Replaces the Mermaid code blocks of rendered body HTML with their diagrams (design.md §7.1,
 * §5.9): the n-th Mermaid block becomes `<div class="mermaid-diagram">{diagrams[n]}</div>`.
 * `diagrams` holds the normalized SVGs in document order (see collectMermaidSources); a block
 * whose diagram is null or missing stays a code block, so its source is not lost.
 */
export function replaceMermaidBlocks(html: string, diagrams: readonly (string | null)[]): string {
  let index = 0;
  return html.replace(CODE_BLOCK_PATTERN, (block, classAttr: string | undefined) => {
    if (!isMermaidLanguage(codeBlockLanguage(classAttr))) return block;
    const svg = diagrams[index++];
    return typeof svg === 'string' ? `<div class="mermaid-diagram">${svg}</div>` : block;
  });
}
