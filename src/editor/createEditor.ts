import { Extension } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Table, TableRow } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { Captions } from './extensions/captions';
import { CrossRef } from './extensions/crossRef';
import { Figcaption, Figure } from './extensions/figure';
import { LabelsExtension } from './extensions/labels';
import { NumberedHeading } from './extensions/numberedHeading';
import { PasteNormalizer } from './extensions/pasteNormalizer';
import { StableId } from './extensions/stableId';
import { RestrictedTableCell, RestrictedTableHeader } from './extensions/tableCell';
import { TableFigure, TableCaption } from './extensions/tableFigure';
import { TableCellGuard } from './extensions/tableCellGuard';
import { Toc, TocDocument } from './extensions/toc';

const ALLOWED_LINK_PATTERN = /^(https?:\/\/|mailto:|#)/i;

/** Links are limited to http(s), mailto and in-document anchors (no javascript: etc.). */
export function isAllowedLinkUrl(url: string): boolean {
  return ALLOWED_LINK_PATTERN.test(url.trim());
}

/** Transaction meta key set when the user asks to edit a link (Mod-k). */
export const REQUEST_LINK_META = 'shitate/requestLink';

const LinkShortcut = Extension.create({
  name: 'linkShortcut',
  addKeyboardShortcuts() {
    return {
      'Mod-k': ({ editor }) => {
        // Never react to keys while the IME is composing.
        if (editor.view.composing) {
          return false;
        }
        editor.view.dispatch(editor.state.tr.setMeta(REQUEST_LINK_META, true));
        return true;
      },
    };
  },
});

/** Smallest width (px) an image can be resized to. */
const IMAGE_MIN_WIDTH = 24;

/** Assembles the editor extensions (design.md §5). */
export function createExtensions(): AnyExtension[] {
  return [
    TocDocument,
    StarterKit.configure({
      // Replaced by TocDocument (`toc? block+`).
      document: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url, { defaultValidate }) => defaultValidate(url) && isAllowedLinkUrl(url),
      },
    }),
    // Images are always block nodes (design.md §5.1). Resizing keeps the aspect ratio and
    // stores the size in px as `width` / `height`.
    Image.configure({
      inline: false,
      allowBase64: true,
      resize: {
        enabled: true,
        directions: ['bottom-left', 'bottom-right'],
        minWidth: IMAGE_MIN_WIDTH,
        minHeight: IMAGE_MIN_WIDTH,
        alwaysPreserveAspectRatio: true,
      },
    }),
    Table.configure({ resizable: true }),
    TableRow,
    RestrictedTableHeader,
    RestrictedTableCell,
    Figure,
    Figcaption,
    TableFigure,
    TableCaption,
    Captions,
    CrossRef,
    PasteNormalizer,
    TableCellGuard,
    NumberedHeading,
    StableId,
    LabelsExtension,
    Toc,
    LinkShortcut,
  ];
}
