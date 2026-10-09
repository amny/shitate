import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { generateStableId, isValidStableId, STABLE_ID_PREFIXES } from '../../core/labels';

const TARGET_TYPES = Object.keys(STABLE_ID_PREFIXES);

interface Target {
  pos: number;
  node: PMNode;
}

function collectTargets(doc: PMNode): Target[] {
  const targets: Target[] = [];
  doc.descendants((node, pos) => {
    if (TARGET_TYPES.includes(node.type.name)) {
      targets.push({ pos, node });
    }
  });
  return targets;
}

/** Position of each valid id in the document (first occurrence). */
function idPositions(doc: PMNode): Map<string, number> {
  const positions = new Map<string, number>();
  for (const { pos, node } of collectTargets(doc)) {
    const id: unknown = node.attrs['id'];
    if (isValidStableId(node.type.name, id) && !positions.has(id)) {
      positions.set(id, pos);
    }
  }
  return positions;
}

/**
 * Targets that need a new id: no id, an id of the wrong form, or a duplicate.
 * For a duplicate, the node at the position the id had before the transactions
 * (mapped through them) keeps the id, so pasting a copy before the original
 * never renames the original (design.md §5.3).
 */
export function findTargetsNeedingIds(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Target[] {
  const mapping = new Mapping();
  for (const tr of transactions) {
    mapping.appendMapping(tr.mapping);
  }
  const before = idPositions(oldState.doc);

  const needing: Target[] = [];
  const byId = new Map<string, Target[]>();
  for (const target of collectTargets(newState.doc)) {
    const id: unknown = target.node.attrs['id'];
    if (!isValidStableId(target.node.type.name, id)) {
      needing.push(target);
    } else {
      byId.set(id, [...(byId.get(id) ?? []), target]);
    }
  }

  for (const [id, occurrences] of byId) {
    if (occurrences.length < 2) continue;
    const oldPos = before.get(id);
    const mapped = oldPos === undefined ? null : mapping.mapResult(oldPos);
    const keeper =
      (mapped && !mapped.deleted && occurrences.find((o) => o.pos === mapped.pos)) ||
      occurrences[0];
    needing.push(...occurrences.filter((o) => o !== keeper));
  }
  return needing;
}

/** Gives headings / figures / tables stable, unique ids (design.md §5.3). */
export const StableId = Extension.create({
  name: 'stableId',
  addGlobalAttributes() {
    return [
      {
        types: TARGET_TYPES,
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute('id'),
            renderHTML: (attributes) => {
              const id: unknown = attributes['id'];
              return typeof id === 'string' && id !== '' ? { id } : {};
            },
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('stableId'),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }
          const needing = findTargetsNeedingIds(transactions, oldState, newState);
          if (needing.length === 0) {
            return null;
          }
          const taken = new Set(idPositions(newState.doc).keys());
          const tr = newState.tr;
          // Attribute changes keep node sizes, so positions stay valid.
          for (const { pos, node } of needing) {
            const id = generateStableId(node.type.name, taken);
            taken.add(id);
            tr.setNodeAttribute(pos, 'id', id);
          }
          return tr;
        },
      }),
    ];
  },
});
