import { Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { renderTocContent, TOC_TITLE, tocEntriesUpTo } from '../../core/export';
import type { TocDepth } from '../../core/export';
import { tocDepthSchema } from '../../core/model';
import { getLabels } from './labels';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toc: {
      /** Inserts the table of contents at the start of the document, or removes it. */
      toggleToc: () => ReturnType;
      /** Sets the depth shown in the table of contents (not part of the document). */
      setTocDepth: (depth: TocDepth) => ReturnType;
    };
  }
}

/** Default until the app passes the depth in effect (the built-in themes' value). */
const DEFAULT_TOC_DEPTH: TocDepth = 3;

export const tocPluginKey = new PluginKey<TocDepth>('toc');

/** Shown in the editor while there are no headings to list. */
export const TOC_EMPTY_TEXT = '見出しを追加すると、ここに目次が表示されます';

/** The TOC node: only ever the first node of the document (design.md §5.1). */
export function findToc(doc: PMNode): PMNode | null {
  const first = doc.firstChild;
  return first?.type.name === 'toc' ? first : null;
}

export function getTocDepth(state: EditorState): TocDepth {
  return tocPluginKey.getState(state) ?? DEFAULT_TOC_DEPTH;
}

/** What the TOC shows now; `key` changes exactly when the shown content changes. */
function tocContent(state: EditorState): { html: string; empty: boolean; key: string } {
  const depth = getTocDepth(state);
  const entries = tocEntriesUpTo(getLabels(state).toc, depth);
  return {
    html: renderTocContent(entries, depth),
    empty: entries.length === 0,
    key: JSON.stringify(entries),
  };
}

function findHeadingPos(doc: PMNode, id: string): number | null {
  const found: number[] = [];
  doc.descendants((node, pos) => {
    if (found.length > 0) return false;
    if (node.type.name === 'heading' && node.attrs['id'] === id) {
      found.push(pos);
      return false;
    }
    return true;
  });
  return found[0] ?? null;
}

function scrollToHeading(view: EditorView, id: string): void {
  const pos = findHeadingPos(view.state.doc, id);
  if (pos === null) return;
  const dom = view.nodeDOM(pos);
  if (dom instanceof HTMLElement) {
    dom.scrollIntoView({ block: 'start' });
  }
  const { tr } = view.state;
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)));
  view.focus();
}

/**
 * Document root: an optional TOC first, then blocks (design.md §5.1). The TOC is not in the
 * `block` group, so it can never appear elsewhere (table cells, lists, quotes) or twice.
 */
export const TocDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'toc? block+',
});

/**
 * Table of contents (design.md §5.1 / §5.5). The node stores nothing: the entries come from
 * computeLabels and the depth from the app settings, so they are never out of date.
 */
export const Toc = Node.create({
  name: 'toc',
  atom: true,
  selectable: true,
  draggable: false,
  parseHTML() {
    return [{ tag: 'nav.doc-toc' }];
  },
  renderHTML() {
    return ['nav', { class: 'doc-toc' }];
  },
  renderText() {
    return '';
  },
  addCommands() {
    return {
      toggleToc:
        () =>
        ({ state, tr, dispatch }) => {
          const toc = findToc(state.doc);
          if (dispatch) {
            if (toc) {
              tr.delete(0, toc.nodeSize);
            } else {
              const type = state.schema.nodes[this.name];
              if (!type) throw new Error(`Schema has no "${this.name}" node`);
              tr.insert(0, type.create());
            }
          }
          return true;
        },
      setTocDepth:
        (depth) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(tocPluginKey, depth).setMeta('addToHistory', false);
          }
          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<TocDepth>({
        key: tocPluginKey,
        state: {
          init: () => DEFAULT_TOC_DEPTH,
          apply: (tr, depth) => {
            const next = tocDepthSchema.safeParse(tr.getMeta(tocPluginKey));
            return next.success ? next.data : depth;
          },
        },
        props: {
          // A node decoration whose spec changes with the content makes ProseMirror call the
          // node view's update(), which then re-renders.
          decorations: (state) => {
            const toc = findToc(state.doc);
            if (!toc) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(0, toc.nodeSize, {}, { tocKey: tocContent(state).key }),
            ]);
          },
        },
      }),
    ];
  },
  addNodeView() {
    return ({ view }) => {
      const dom = document.createElement('nav');
      dom.className = 'doc-toc';
      dom.setAttribute('aria-label', TOC_TITLE);
      dom.contentEditable = 'false';
      let renderedKey: string | null = null;

      const render = () => {
        const content = tocContent(view.state);
        if (content.key === renderedKey) return;
        renderedKey = content.key;
        // Escaped markup shared with the export (core/export/toc.ts).
        dom.innerHTML = content.html;
        if (content.empty) {
          const placeholder = document.createElement('div');
          placeholder.className = 'toc-placeholder';
          placeholder.textContent = TOC_EMPTY_TEXT;
          dom.append(placeholder);
        }
      };
      render();

      dom.addEventListener('click', (event) => {
        const item = event.target instanceof Element ? event.target.closest('a.toc-item') : null;
        if (!item) return;
        event.preventDefault();
        scrollToHeading(view, item.getAttribute('href')?.slice(1) ?? '');
      });

      return {
        dom,
        update: (node) => {
          if (node.type.name !== 'toc') return false;
          render();
          return true;
        },
        // Clicks on entries are handled above; elsewhere the node is selected as usual.
        stopEvent: (event) =>
          event.target instanceof Element && event.target.closest('a.toc-item') !== null,
        ignoreMutation: () => true,
      };
    };
  },
});
