import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { computeLabels, formatRef } from '../../core/labels';
import type { Labels } from '../../core/labels';
import type { DocNode, DocRoot } from '../../core/model';

interface LabelsState {
  labels: Labels;
  decorations: DecorationSet;
}

/** Shown for a cross reference whose target no longer exists (design.md §5.5). */
export const BROKEN_REF_LABEL = '参照先なし';

export const labelsPluginKey = new PluginKey<LabelsState>('labels');

/** ProseMirror node -> the core document shape (no JSON round trip, no casts). */
function toDocNode(node: PMNode): DocNode {
  const result: DocNode = { type: node.type.name, attrs: { ...node.attrs } };
  if (node.isText) {
    result.text = node.text ?? '';
  }
  if (node.childCount > 0) {
    const content: DocNode[] = [];
    node.forEach((child) => content.push(toDocNode(child)));
    result.content = content;
  }
  return result;
}

function toDocRoot(doc: PMNode): DocRoot {
  const content: DocNode[] = [];
  doc.forEach((child) => content.push(toDocNode(child)));
  return { type: 'doc', content };
}

function numberWidget(className: string, text: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.contentEditable = 'false';
  span.textContent = text;
  return span;
}

/** Number before the caption text and, while the caption is empty, a placeholder. */
function captionDecorations(caption: PMNode, captionPos: number, number: string): Decoration[] {
  const decorations = [
    Decoration.widget(captionPos + 1, () => numberWidget('caption-number', number), {
      side: -1,
      ignoreSelection: true,
      key: `caption-number:${number}`,
    }),
  ];
  if (caption.content.size === 0) {
    decorations.push(
      Decoration.node(captionPos, captionPos + caption.nodeSize, {
        class: 'is-empty-caption',
        'data-placeholder': 'キャプションを入力',
      }),
    );
  }
  return decorations;
}

function buildState(doc: PMNode): LabelsState {
  const labels = computeLabels(toDocRoot(doc));
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    const id: unknown = node.attrs['id'];
    switch (node.type.name) {
      case 'heading': {
        const number = typeof id === 'string' ? labels.headings.get(id)?.number : undefined;
        if (typeof id === 'string' && number) {
          decorations.push(
            Decoration.widget(pos + 1, () => numberWidget('heading-number', number), {
              side: -1,
              ignoreSelection: true,
              key: `heading-number:${id}:${number}`,
            }),
          );
        }
        return false;
      }
      case 'figure': {
        // figure = image + figcaption
        const label = typeof id === 'string' ? labels.figures.get(id) : undefined;
        const image = node.maybeChild(0);
        const caption = node.maybeChild(1);
        if (label && image && caption) {
          decorations.push(
            ...captionDecorations(caption, pos + 1 + image.nodeSize, `図${String(label.number)}`),
          );
        }
        return false;
      }
      case 'tableFigure': {
        // tableFigure = tableCaption + table; tables in its cells carry no number.
        const label = typeof id === 'string' ? labels.tables.get(id) : undefined;
        const caption = node.maybeChild(0);
        if (label && caption) {
          decorations.push(...captionDecorations(caption, pos + 1, `表${String(label.number)}`));
        }
        return false;
      }
      case 'crossRef': {
        const targetId: unknown = node.attrs['targetId'];
        const label = typeof targetId === 'string' ? formatRef(labels, targetId) : null;
        decorations.push(
          Decoration.node(
            pos,
            pos + node.nodeSize,
            label === null
              ? { 'data-label': BROKEN_REF_LABEL, class: 'is-broken' }
              : { 'data-label': label },
          ),
        );
        return false;
      }
      default:
        return true;
    }
  });
  return { labels, decorations: DecorationSet.create(doc, decorations) };
}

/** Labels of the current document (numbers, TOC entries), kept up to date by the plugin. */
export function getLabels(state: EditorState): Labels {
  const pluginState = labelsPluginKey.getState(state);
  if (!pluginState) {
    throw new Error('The labels plugin is not installed in this editor');
  }
  return pluginState.labels;
}

/**
 * Keeps computeLabels' result in plugin state and shows heading / figure / table numbers and
 * cross reference labels as decorations (design.md §5.5). Numbers are never written into the
 * document text.
 */
export const LabelsExtension = Extension.create({
  name: 'labels',
  addProseMirrorPlugins() {
    return [
      new Plugin<LabelsState>({
        key: labelsPluginKey,
        state: {
          init: (_config, state) => buildState(state.doc),
          apply: (tr, value, _oldState, newState) =>
            tr.docChanged ? buildState(newState.doc) : value,
        },
        props: {
          decorations: (state) => labelsPluginKey.getState(state)?.decorations ?? null,
        },
      }),
    ];
  },
});
