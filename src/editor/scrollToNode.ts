import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** Position of the node whose `id` attribute is `id` (heading, figure, table), or null. */
export function findNodePosById(doc: PMNode, id: string): number | null {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (found.length > 0) return false;
    if (node.attrs['id'] === id) {
      found.push(pos);
      return false;
    }
    return true;
  });
  return found[0] ?? null;
}

/** Cursor at the start of the node's first textblock (heading, caption), else the node itself. */
function selectionFor(doc: PMNode, pos: number): Selection {
  const node = doc.nodeAt(pos);
  if (!node) throw new Error(`No node at position ${String(pos)}`);
  if (node.isTextblock) return TextSelection.create(doc, pos + 1);
  const textPositions: number[] = [];
  node.descendants((child, offset) => {
    if (textPositions.length > 0) return false;
    if (child.isTextblock) {
      textPositions.push(pos + 1 + offset + 1);
      return false;
    }
    return true;
  });
  const textPos = textPositions[0];
  return textPos === undefined
    ? NodeSelection.create(doc, pos)
    : TextSelection.create(doc, textPos);
}

/**
 * Scrolls the node at `pos` to the top and moves the cursor into it (design.md §5.8).
 * Shared by the TOC entries and the outline panel.
 */
export function scrollToNodeAt(view: EditorView, pos: number): void {
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: 'start' });
  }
  const { tr } = view.state;
  view.dispatch(tr.setSelection(selectionFor(tr.doc, pos)));
  view.focus();
}

/** {@link scrollToNodeAt} for the node with the given id; false when it no longer exists. */
export function scrollToNode(view: EditorView, id: string): boolean {
  const pos = findNodePosById(view.state.doc, id);
  if (pos === null) return false;
  scrollToNodeAt(view, pos);
  return true;
}
