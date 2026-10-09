import type { DocRoot, EmbeddedData } from '../model';

export type ImportResult =
  /** Markdown / external HTML / TipTap JSON: body only (design.md §6). */
  | { ok: true; kind: 'document'; doc: DocRoot; warnings: string[] }
  /** HTML exported by this app: full document state and theme. */
  | { ok: true; kind: 'embedded'; data: EmbeddedData; warnings: string[] }
  | { ok: false; error: string };

export interface ImportedFile {
  name: string;
  text: string;
}
