import type { Extensions } from '@tiptap/core';
import { EMBEDDED_DATA_ELEMENT_ID } from '../export';
import type { EmbeddedData } from '../model';
import { checkAgainstEditorSchema } from './json';
import { migrate } from './migrate';

export type SelfFormatResult = { ok: true; data: EmbeddedData } | { ok: false; error: string };

/** Returns the embedded JSON text of an exported HTML file, or null for other HTML. */
export function findEmbeddedJson(html: string): string | null {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const script = document.querySelector(
    `script#${EMBEDDED_DATA_ELEMENT_ID}[type="application/json"]`,
  );
  return script?.textContent ?? null;
}

/** Restores the embedded data of an exported HTML file (design.md §6). */
export function readSelfFormat(jsonText: string, extensions: Extensions): SelfFormatResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error: unknown) {
    return {
      ok: false,
      error: `埋め込みデータを読み込めません（${error instanceof Error ? error.message : String(error)}）`,
    };
  }

  const migrated = migrate(parsed);
  if (!migrated.ok) {
    return migrated;
  }
  // Kept as embedded (not normalized) so export -> import round trips are exact.
  const schemaError = checkAgainstEditorSchema(migrated.data.state.doc, extensions);
  if (schemaError) {
    return { ok: false, error: schemaError };
  }
  return migrated;
}
