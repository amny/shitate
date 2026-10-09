import { Extension } from '@tiptap/core';
import type { Node as PMNode, Schema } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    captions: {
      /** Adds a caption to the image / table at the selection, or removes it. */
      toggleCaption: () => ReturnType;
      /** Deletes the table at the selection, together with its caption if it has one. */
      deleteTableWithCaption: () => ReturnType;
    };
  }
}

const CELL_TYPES = new Set(['tableCell', 'tableHeader']);

export type CaptionTarget = {
  action: 'wrapImage' | 'unwrapFigure' | 'wrapTable' | 'unwrapTable';
  pos: number;
  node: PMNode;
} | null;

function nodeType(schema: Schema, name: string) {
  const type = schema.nodes[name];
  if (!type) {
    throw new Error(`Schema has no "${name}" node`);
  }
  return type;
}

/**
 * What the caption button acts on. Images and tables inside table cells never get captions
 * (design.md §5.2), so they return null.
 */
export function findCaptionTarget(state: EditorState): CaptionTarget {
  const { selection } = state;
  const { $from } = selection;

  const inCellAbove = (depth: number) => {
    for (let d = depth; d > 0; d--) {
      if (CELL_TYPES.has($from.node(d).type.name)) return true;
    }
    return false;
  };

  if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
    if (inCellAbove($from.depth)) return null;
    const parent = $from.parent;
    if (parent.type.name === 'figure') {
      return { action: 'unwrapFigure', pos: $from.before(), node: parent };
    }
    return { action: 'wrapImage', pos: selection.from, node: selection.node };
  }

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    const name = node.type.name;
    if (name === 'figure') {
      return { action: 'unwrapFigure', pos: $from.before(depth), node };
    }
    if (name === 'tableFigure') {
      return { action: 'unwrapTable', pos: $from.before(depth), node };
    }
    if (name === 'table') {
      // The innermost table: captionable only when it is not inside a cell.
      if (inCellAbove(depth - 1)) return null;
      const parent = $from.node(depth - 1);
      if (parent.type.name === 'tableFigure') {
        return { action: 'unwrapTable', pos: $from.before(depth - 1), node: parent };
      }
      return { action: 'wrapTable', pos: $from.before(depth), node };
    }
  }
  return null;
}

/** Caption content kept as a paragraph when a caption is removed (never dropped silently). */
function captionAsParagraph(schema: Schema, caption: PMNode | null | undefined): PMNode[] {
  if (!caption || caption.content.size === 0) return [];
  return [nodeType(schema, 'paragraph').create(null, caption.content)];
}

export function applyCaptionToggle(tr: Transaction, target: NonNullable<CaptionTarget>): void {
  const { schema } = tr.doc.type;
  const { pos, node } = target;
  const end = pos + node.nodeSize;
  switch (target.action) {
    case 'wrapImage': {
      const figure = nodeType(schema, 'figure').create(null, [
        node,
        nodeType(schema, 'figcaption').create(),
      ]);
      tr.replaceWith(pos, end, figure);
      // Into the empty caption: figure start + image + caption start.
      tr.setSelection(TextSelection.create(tr.doc, pos + 1 + node.nodeSize + 1));
      return;
    }
    case 'unwrapFigure': {
      const image = node.child(0);
      tr.replaceWith(pos, end, [image, ...captionAsParagraph(schema, node.maybeChild(1))]);
      tr.setSelection(NodeSelection.create(tr.doc, pos));
      return;
    }
    case 'wrapTable': {
      const tableFigure = nodeType(schema, 'tableFigure').create(null, [
        nodeType(schema, 'tableCaption').create(),
        node,
      ]);
      tr.replaceWith(pos, end, tableFigure);
      tr.setSelection(TextSelection.create(tr.doc, pos + 2));
      return;
    }
    case 'unwrapTable': {
      const caption = node.child(0);
      const table = node.child(1);
      const before = captionAsParagraph(schema, caption);
      tr.replaceWith(pos, end, [...before, table]);
      const tableStart = pos + before.reduce((size, n) => size + n.nodeSize, 0);
      tr.setSelection(TextSelection.near(tr.doc.resolve(tableStart + 1)));
      return;
    }
  }
}

/**
 * Figures whose image is gone. Deleting / cutting the image of a figure makes ProseMirror
 * refill the required image with an empty one (no src); such figures are replaced by their
 * caption text so nothing broken is left behind.
 */
export function findFiguresWithoutImage(doc: PMNode): { pos: number; node: PMNode }[] {
  const found: { pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'figure') return true;
    const src: unknown = node.maybeChild(0)?.attrs['src'];
    if (typeof src !== 'string' || src === '') found.push({ pos, node });
    return false;
  });
  return found;
}

/** Caption commands (design.md §5.1): toggle on images / tables, delete captioned tables. */
export const Captions = Extension.create({
  name: 'captions',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('figureRepair'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const broken = findFiguresWithoutImage(newState.doc);
          if (broken.length === 0) return null;
          const tr = newState.tr;
          for (const { pos, node } of [...broken].reverse()) {
            tr.replaceWith(
              pos,
              pos + node.nodeSize,
              captionAsParagraph(newState.schema, node.maybeChild(1)),
            );
          }
          return tr;
        },
      }),
    ];
  },
  addCommands() {
    return {
      toggleCaption:
        () =>
        ({ state, tr, dispatch }) => {
          const target = findCaptionTarget(state);
          if (!target) return false;
          if (dispatch) applyCaptionToggle(tr, target);
          return true;
        },
      deleteTableWithCaption:
        () =>
        ({ state, tr, dispatch, commands }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name !== 'table') continue;
            // Deleting only the table would leave a tableFigure without its required table.
            if ($from.node(depth - 1).type.name === 'tableFigure') {
              if (dispatch) tr.delete($from.before(depth - 1), $from.after(depth - 1));
              return true;
            }
            return commands.deleteTable();
          }
          return false;
        },
    };
  },
});
