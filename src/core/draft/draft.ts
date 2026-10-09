import type { Extensions } from '@tiptap/core';
import { z } from 'zod';
import { checkAgainstEditorSchema } from '../import/json';
import { migrate } from '../import/migrate';
import type { EmbeddedData } from '../model';

/** Key of the autosaved draft in the "drafts" store (design.md §9.2). */
export const CURRENT_DRAFT_KEY = 'current';

export interface Draft {
  /** ISO date-time of the save. */
  savedAt: string;
  /** Name of the file the document was opened from, if any. */
  fileName: string | null;
  /** Same shape as the data embedded in exported HTML. */
  data: EmbeddedData;
}

const draftEnvelopeSchema = z.object({
  savedAt: z.iso.datetime(),
  fileName: z.string().nullable(),
  data: z.unknown(),
});

export function createDraft(data: EmbeddedData, fileName: string | null, savedAt: Date): Draft {
  return { savedAt: savedAt.toISOString(), fileName, data };
}

export type ParseDraftResult = { ok: true; draft: Draft } | { ok: false; error: string };

/** Validates a stored draft (shape, data version and editor schema). */
export function parseDraft(value: unknown, extensions: Extensions): ParseDraftResult {
  const envelope = draftEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return { ok: false, error: '自動保存データの形式が不正です' };
  }
  const migrated = migrate(envelope.data.data);
  if (!migrated.ok) {
    return { ok: false, error: migrated.error };
  }
  const schemaError = checkAgainstEditorSchema(migrated.data.state.doc, extensions);
  if (schemaError) {
    return { ok: false, error: schemaError };
  }
  return {
    ok: true,
    draft: {
      savedAt: envelope.data.savedAt,
      fileName: envelope.data.fileName,
      data: migrated.data,
    },
  };
}
