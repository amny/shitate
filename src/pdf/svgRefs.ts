/** `url(#viv-id-<document url>:0023<id>)`, Vivliostyle's rewrite of `url(#<id>)`. */
const VIVLIOSTYLE_REF_PATTERN = /url\(\s*["']?#viv-id-[^"')]*?:0023([^"')]+)["']?\s*\)/g;

/**
 * Vivliostyle rewrites the `url(#id)` references in SVG attributes (Mermaid's arrow markers)
 * to its own ids but leaves the referenced elements with their original id, so the arrows
 * disappear. Points the references in the laid out pages back at the original id
 * (design.md §10, docs/spike-mermaid.md §3.1). Run after every completed layout; returns the
 * number of references fixed.
 */
export function fixSvgRefs(viewport: ParentNode): number {
  let count = 0;
  for (const element of viewport.querySelectorAll('[data-vivliostyle-page-container] svg *')) {
    for (const { name, value } of [...element.attributes]) {
      if (!value.includes('#viv-id-')) continue;
      element.setAttribute(
        name,
        value.replace(VIVLIOSTYLE_REF_PATTERN, (_match, id: string) => {
          count++;
          return `url(#${id})`;
        }),
      );
    }
  }
  return count;
}
