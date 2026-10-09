import { getSchema } from '@tiptap/core';
import type { Extensions } from '@tiptap/core';
import { docRootSchema } from '../model';
import type { DocRoot } from '../model';

export type JsonImportResult = { ok: true; doc: DocRoot } | { ok: false; error: string };

/**
 * Checks a document against the editor schema: unknown node types and invalid nesting
 * (e.g. a heading directly in a table cell) are rejected. Returns null when valid.
 */
export function checkAgainstEditorSchema(doc: DocRoot, extensions: Extensions): string | null {
  try {
    getSchema(extensions).nodeFromJSON(doc).check();
    return null;
  } catch (error: unknown) {
    return `文書の構造がエディターで扱えない形式です（${error instanceof Error ? error.message : String(error)}）`;
  }
}

/** TipTap JSON → validated editor JSON (design.md §6). */
export function jsonToDoc(text: string, extensions: Extensions): JsonImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error: unknown) {
    return {
      ok: false,
      error: `JSONとして読み込めません（${error instanceof Error ? error.message : String(error)}）`,
    };
  }

  const root = docRootSchema.safeParse(parsed);
  if (!root.success) {
    return { ok: false, error: 'TipTap JSON（"type": "doc" のオブジェクト）ではありません' };
  }
  const schemaError = checkAgainstEditorSchema(root.data, extensions);
  if (schemaError) {
    return { ok: false, error: schemaError };
  }
  // Normalize (fills default attributes) so it matches what the editor produces.
  const normalized: unknown = getSchema(extensions).nodeFromJSON(root.data).toJSON();
  return { ok: true, doc: docRootSchema.parse(normalized) };
}
