import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { normalizeImportedHtml } from '../../core/import/normalizeHtml';

/** Applies the import normalization (design.md §6) to pasted HTML as well. */
export const PasteNormalizer = Extension.create({
  name: 'pasteNormalizer',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteNormalizer'),
        props: {
          transformPastedHTML: (html) => normalizeImportedHtml(html),
        },
      }),
    ];
  },
});
