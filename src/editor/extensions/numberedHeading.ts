import { Extension } from '@tiptap/core';

/**
 * Adds `numbered` (default true) to headings (design.md §5.1).
 * Rendered as data-numbered="false" only when numbering is turned off.
 */
export const NumberedHeading = Extension.create({
  name: 'numberedHeading',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          numbered: {
            default: true,
            parseHTML: (element) => element.getAttribute('data-numbered') !== 'false',
            renderHTML: (attributes) =>
              attributes['numbered'] === false ? { 'data-numbered': 'false' } : {},
          },
        },
      },
    ];
  },
});
