import type { Extensions } from '@tiptap/core';
import { customAlphabet } from 'nanoid';
import { z } from 'zod';
import { checkAgainstEditorSchema } from '../import/json';
import { migrate } from '../import/migrate';
import type { DocNode, EmbeddedData } from '../model';

/**
 * Key of the single draft saved before documents had their own slots (task 1-5).
 * It is kept as an ordinary document under this id (design.md §9.2).
 */
export const LEGACY_DRAFT_KEY = 'current';

export const UNTITLED_DOCUMENT_NAME = '無題の文書';

const draftIdSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

/** A new key for a document in the "drafts" and "draftMeta" stores. */
export function createDraftId(): string {
  return `d-${draftIdSuffix()}`;
}

export interface Draft {
  /** Key in the "drafts" store. Not part of the stored value. */
  id: string;
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

/** The stored value of a draft (the key is the id). */
export type StoredDraft = Omit<Draft, 'id'>;

/** What the saved documents list shows, stored in "draftMeta" so that listing never reads bodies. */
export interface DraftSummary {
  id: string;
  /** The cover title (may be empty). */
  title: string;
  fileName: string | null;
  /** The first text of the body (may be empty), to tell untitled documents apart. */
  excerpt: string;
  /** ISO date-time of the last save. */
  savedAt: string;
}

const draftSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  fileName: z.string().nullable(),
  excerpt: z.string(),
  savedAt: z.iso.datetime(),
});

export function createDraft(
  data: EmbeddedData,
  fileName: string | null,
  savedAt: Date,
): StoredDraft {
  return { savedAt: savedAt.toISOString(), fileName, data };
}

export const EXCERPT_MAX_LENGTH = 40;

function blockText(node: DocNode): string {
  return node.text ?? (node.content ?? []).map(blockText).join('');
}

/** Text of the first block that has any, cut to EXCERPT_MAX_LENGTH characters. */
export function extractExcerpt(doc: { content?: DocNode[] | undefined }): string {
  for (const block of doc.content ?? []) {
    const text = blockText(block).replace(/\s+/g, ' ').trim();
    if (text !== '') {
      const chars = Array.from(text);
      return chars.length > EXCERPT_MAX_LENGTH
        ? `${chars.slice(0, EXCERPT_MAX_LENGTH).join('')}…`
        : text;
    }
  }
  return '';
}

export function summarizeDraft(id: string, draft: StoredDraft): DraftSummary {
  return {
    id,
    title: draft.data.state.meta.title,
    fileName: draft.fileName,
    excerpt: extractExcerpt(draft.data.state.doc),
    savedAt: draft.savedAt,
  };
}

/** Validates a stored summary. Returns null when it is malformed. */
export function parseDraftSummary(value: unknown): DraftSummary | null {
  const result = draftSummarySchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Newest first. */
export function sortDraftSummaries(summaries: readonly DraftSummary[]): DraftSummary[] {
  return [...summaries].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** Replaces the summary with the same id, or adds it. */
export function upsertDraftSummary(
  summaries: readonly DraftSummary[],
  summary: DraftSummary,
): DraftSummary[] {
  return sortDraftSummaries([...summaries.filter((s) => s.id !== summary.id), summary]);
}

/** Title, else file name, else the start of the body, else "無題の文書". */
export function draftDisplayName(
  summary: Pick<DraftSummary, 'title' | 'fileName' | 'excerpt'>,
): string {
  return summary.title.trim() || summary.fileName || summary.excerpt || UNTITLED_DOCUMENT_NAME;
}

export type ParseDraftResult = { ok: true; draft: Draft } | { ok: false; error: string };

/** Validates a stored draft (shape, data version and editor schema). `id` is its key. */
export function parseDraft(id: string, value: unknown, extensions: Extensions): ParseDraftResult {
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
      id,
      savedAt: envelope.data.savedAt,
      fileName: envelope.data.fileName,
      data: migrated.data,
    },
  };
}
