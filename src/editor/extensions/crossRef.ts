import { Node } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    crossRef: {
      /** Inserts a reference to the heading / figure / table with the id. */
      insertCrossRef: (targetId: string) => ReturnType;
    };
  }
}

/**
 * Cross reference to a heading / figure / table (design.md §5.1).
 * The text ("2.1節", "図3") is never stored: the labels plugin resolves it for display and
 * the export resolves it for output.
 */
export const CrossRef = Node.create({
  name: 'crossRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (element) => {
          const id = element.getAttribute('data-target-id');
          if (id) return id;
          const href = element.getAttribute('href');
          return href?.startsWith('#') ? href.slice(1) : null;
        },
        renderHTML: (attributes) => {
          const id: unknown = attributes['targetId'];
          return typeof id === 'string' ? { 'data-target-id': id } : {};
        },
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'span.xref[data-target-id]', priority: 60 },
      // As exported (design.md §7.1); before the link mark takes the <a>.
      { tag: 'a.xref[href^="#"]', priority: 60 },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', { class: 'xref', ...HTMLAttributes }];
  },
  renderText() {
    return '';
  },
  addCommands() {
    return {
      insertCrossRef:
        (targetId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { targetId } }),
    };
  },
});
