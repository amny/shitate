import { mergeAttributes, Node } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableFigure: {
      /** Puts the captioned table at the selection on a landscape PDF page, or back. */
      toggleTableLandscape: () => ReturnType;
    };
  }
}

/**
 * The captioned table around the selection, or null. Tables inside its cells belong to it;
 * a table without a caption has no landscape setting.
 */
export function findTableFigure(state: EditorState): { pos: number; landscape: boolean } | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'tableFigure') {
      return { pos: $from.before(depth), landscape: node.attrs['landscape'] === true };
    }
  }
  return null;
}

/** Caption of a body table, shown above it (design.md §5.1). Only valid inside `tableFigure`. */
export const TableCaption = Node.create({
  name: 'tableCaption',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.table-caption' }, { tag: 'caption' }];
  },
  renderHTML() {
    return ['div', { class: 'table-caption' }, 0];
  },
});

/** Body table with a caption. Numbered as 表N (design.md §5.1). */
export const TableFigure = Node.create({
  name: 'tableFigure',
  group: 'block',
  content: 'tableCaption table',
  isolating: true,
  addAttributes() {
    return {
      // Placed on a landscape page in the PDF (design.md §10.1).
      landscape: {
        default: false,
        parseHTML: (element) => element.classList.contains('is-landscape'),
        renderHTML: (attributes) =>
          attributes['landscape'] === true ? { class: 'is-landscape' } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div.table-figure' }];
  },
  addCommands() {
    return {
      toggleTableLandscape:
        () =>
        ({ state, tr, dispatch }) => {
          const figure = findTableFigure(state);
          if (!figure) return false;
          if (dispatch) tr.setNodeAttribute(figure.pos, 'landscape', !figure.landscape);
          return true;
        },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'table-figure' }, HTMLAttributes), 0];
  },
});
