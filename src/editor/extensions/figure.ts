import { Node } from '@tiptap/core';

/** Caption of a body figure (design.md §5.1). Only valid inside `figure`. */
export const Figcaption = Node.create({
  name: 'figcaption',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'figcaption' }];
  },
  renderHTML() {
    return ['figcaption', 0];
  },
});

/** Body figure: an image with a caption. Numbered as 図N (design.md §5.1). */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'image figcaption',
  isolating: true,
  parseHTML() {
    return [{ tag: 'figure' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', HTMLAttributes, 0];
  },
});
