import { Extension } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Node as PMNode, ResolvedPos, Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

const CELL_TYPES = new Set(['tableCell', 'tableHeader']);
/** Captioned blocks that are numbered, which table cells must not contain (design.md §5.2). */
const CAPTIONED_TYPES = new Set(['figure', 'tableFigure']);

interface Found {
  pos: number;
  node: PMNode;
}

/**
 * Nodes not allowed inside table cells, found at any depth (e.g. via a list item or
 * blockquote, which the cell content rule cannot prevent): headings and captioned blocks.
 */
export function findDisallowedInTableCells(doc: PMNode): { headings: Found[]; captioned: Found[] } {
  const headings: Found[] = [];
  const captioned: Found[] = [];
  doc.descendants((node, pos) => {
    if (!CELL_TYPES.has(node.type.name)) {
      return true;
    }
    node.descendants((child, childPos) => {
      const found = { pos: pos + 1 + childPos, node: child };
      if (child.type.name === 'heading') {
        headings.push(found);
      } else if (CAPTIONED_TYPES.has(child.type.name)) {
        captioned.push(found);
        return false;
      }
      return true;
    });
    // Nested cells were already visited by node.descendants.
    return false;
  });
  return { headings, captioned };
}

function isInTableCell($pos: ResolvedPos): boolean {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (CELL_TYPES.has($pos.node(depth).type.name)) {
      return true;
    }
  }
  return false;
}

function paragraphType(schema: Schema) {
  const type = schema.nodes['paragraph'];
  if (!type) {
    throw new Error('Schema has no "paragraph" node');
  }
  return type;
}

/**
 * Plain blocks for a captioned block: the image / table plus its caption text as a paragraph
 * (kept, not dropped). Caption above a table stays above it.
 */
export function uncaption(node: PMNode, schema: Schema): PMNode[] {
  const paragraph = paragraphType(schema);
  const captionParagraph = (caption: PMNode | null) =>
    caption && caption.content.size > 0 ? [paragraph.create(null, caption.content)] : [];
  if (node.type.name === 'figure') {
    return [
      ...(node.maybeChild(0) ? [node.child(0)] : []),
      ...captionParagraph(node.maybeChild(1)),
    ];
  }
  if (node.type.name === 'tableFigure') {
    return [
      ...captionParagraph(node.maybeChild(0)),
      ...(node.maybeChild(1) ? [node.child(1)] : []),
    ];
  }
  return [node];
}

/** Makes a fragment fit in a table cell: headings -> paragraphs, captioned blocks unwrapped. */
export function fitForTableCell(fragment: Fragment, schema: Schema): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === 'heading') {
      nodes.push(paragraphType(schema).create(null, node.content, node.marks));
    } else if (CAPTIONED_TYPES.has(node.type.name)) {
      nodes.push(
        ...uncaption(node, schema).map((n) =>
          n.isTextblock ? n : n.copy(fitForTableCell(n.content, schema)),
        ),
      );
    } else if (node.isLeaf || node.isTextblock) {
      nodes.push(node);
    } else {
      nodes.push(node.copy(fitForTableCell(node.content, schema)));
    }
  });
  return Fragment.from(nodes);
}

/** Rewrites clipboard HTML so it fits in a table cell (headings / figures / table captions). */
export function simplifyHtmlForTableCell(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  const toParagraph = (element: Element) => {
    const paragraph = document.createElement('p');
    paragraph.append(...element.childNodes);
    return paragraph;
  };
  for (const heading of template.content.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    heading.replaceWith(toParagraph(heading));
  }
  for (const caption of template.content.querySelectorAll(
    'figcaption, .table-caption, caption, .caption-number',
  )) {
    if (caption.classList.contains('caption-number')) {
      caption.remove();
    } else if (caption.tagName === 'CAPTION') {
      // A <caption> inside a table becomes a paragraph before the table.
      caption.closest('table')?.before(toParagraph(caption));
      caption.remove();
    } else {
      caption.replaceWith(toParagraph(caption));
    }
  }
  for (const wrapper of template.content.querySelectorAll('figure, .table-figure')) {
    wrapper.replaceWith(...wrapper.childNodes);
  }
  return template.innerHTML;
}

/**
 * Keeps table cells free of headings and captioned blocks (design.md §5.2).
 * - Pasting into a cell rewrites them before parsing; otherwise ProseMirror parses them
 *   in the cell context and wraps them in a blockquote to make them fit.
 * - Anything that still ends up in a cell is converted after the transaction:
 *   headings become paragraphs, figures / captioned tables become image / table + caption text.
 */
export const TableCellGuard = Extension.create({
  name: 'tableCellGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tableCellGuard'),
        props: {
          transformPastedHTML(html, view) {
            return isInTableCell(view.state.selection.$from)
              ? simplifyHtmlForTableCell(html)
              : html;
          },
          transformPasted(slice, view) {
            if (!isInTableCell(view.state.selection.$from)) {
              return slice;
            }
            return new Slice(
              fitForTableCell(slice.content, view.state.schema),
              slice.openStart,
              slice.openEnd,
            );
          },
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }
          const { headings, captioned } = findDisallowedInTableCells(newState.doc);
          if (headings.length === 0 && captioned.length === 0) {
            return null;
          }
          const tr = newState.tr;
          const paragraph = paragraphType(newState.schema);
          // setNodeMarkup keeps node sizes, so positions stay valid.
          for (const { pos } of headings) {
            tr.setNodeMarkup(pos, paragraph);
          }
          // Replace from the end so earlier positions stay valid.
          for (const { pos, node } of [...captioned].reverse()) {
            tr.replaceWith(pos, pos + node.nodeSize, uncaption(node, newState.schema));
          }
          return tr;
        },
      }),
    ];
  },
});
