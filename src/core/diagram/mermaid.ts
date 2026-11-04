import DOMPurify from 'dompurify';
import type { DocNode } from '../model';

/** The `codeBlock.language` value the editor stores for a Mermaid diagram (design.md §5.9). */
export const MERMAID_LANGUAGE = 'mermaid';

/** Whether a `codeBlock.language` value marks the block as a Mermaid diagram (any case). */
export function isMermaidLanguage(language: unknown): boolean {
  return typeof language === 'string' && language.trim().toLowerCase() === MERMAID_LANGUAGE;
}

function nodeText(node: DocNode): string {
  return (node.content ?? []).map((child) => child.text ?? nodeText(child)).join('');
}

/**
 * The sources of the Mermaid diagrams in `doc`, in document order (the order the export
 * renders the code blocks in, design.md §7.1).
 */
export function collectMermaidSources(doc: DocNode): string[] {
  const sources: string[] = [];
  const visit = (node: DocNode): void => {
    if (node.type === 'codeBlock' && isMermaidLanguage(node.attrs?.['language'])) {
      sources.push(nodeText(node));
      return;
    }
    node.content?.forEach(visit);
  };
  visit(doc);
  return sources;
}

const SIZE_STYLE_PROPERTIES = new Set(['max-width', 'width', 'height']);

/** The root `style` with the size properties replaced by `max-width: 100%; height: auto`. */
function rootStyle(style: string | null): string {
  const kept = (style ?? '')
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const name = declaration.split(':')[0]?.trim().toLowerCase() ?? '';
      return name !== '' && !SIZE_STYLE_PROPERTIES.has(name);
    });
  return [...kept, 'max-width: 100%', 'height: auto'].join('; ');
}

/**
 * Prepares an SVG rendered by Mermaid for the editor and the export (design.md §5.9, S-2):
 * sanitizes it with DOMPurify's SVG profile, gives it its natural size from the viewBox
 * (Mermaid writes `width="100%"`), and lets it shrink to the available width only.
 * Throws when the input is not an SVG.
 */
export function normalizeMermaidSvg(svg: string): string {
  const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
  const parsed = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg' || parsed.querySelector('parsererror')) {
    throw new Error('Mermaid output is not an SVG element');
  }
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , width, height] = box;
  if (
    box.length === 4 &&
    box.every((value) => Number.isFinite(value)) &&
    width !== undefined &&
    height !== undefined
  ) {
    root.setAttribute('width', String(Math.ceil(width)));
    root.setAttribute('height', String(Math.ceil(height)));
  }
  root.setAttribute('style', rootStyle(root.getAttribute('style')));
  return new XMLSerializer().serializeToString(root);
}

/**
 * Replaces the temporary id a diagram was rendered with by `id` (design.md §5.9). Mermaid
 * uses the render id for the root element and as the prefix of every id and `<style>`
 * selector in the SVG, so the temporary id (a random string) is replaced everywhere.
 */
export function replaceDiagramId(svg: string, temporaryId: string, id: string): string {
  return svg.replaceAll(temporaryId, id);
}
