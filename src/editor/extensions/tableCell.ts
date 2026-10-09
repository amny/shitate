import { TableCell, TableHeader } from '@tiptap/extension-table';

/** Blocks allowed directly inside a table cell (design.md §5.2). */
export const TABLE_CELL_CONTENT =
  '(paragraph | bulletList | orderedList | blockquote | codeBlock | image | table)+';

export const RestrictedTableCell = TableCell.extend({
  content: TABLE_CELL_CONTENT,
});

export const RestrictedTableHeader = TableHeader.extend({
  content: TABLE_CELL_CONTENT,
});
