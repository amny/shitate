import type { Editor, JSONContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { getStorageAdapter } from '../../adapters';
import type { StorageAdapter } from '../../adapters';
import {
  createAutosaver,
  createDraft,
  createDraftId,
  LEGACY_DRAFT_KEY,
  parseDraft,
  parseDraftSummary,
  sortDraftSummaries,
  summarizeDraft,
  upsertDraftSummary,
} from '../../core/draft';
import type { AutosaveStatus, Autosaver, DraftSummary } from '../../core/draft';
import { createExtensions } from '../../editor/createEditor';
import { collectEmbeddedData, replaceDocumentBody } from '../documentState';
import type { Notice } from '../notice';
import { useDocumentStore } from '../store/documentStore';

/** design.md §9.2: save 1 second after the last change. */
export const AUTOSAVE_DELAY_MS = 1000;

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

export interface DocumentSwitch {
  /** Loads the next document into the editor and the store. Must be synchronous. */
  load: () => void;
  /** Slot of a saved document; omitted for a new slot. */
  id?: string;
  /** Saves the loaded document right away (e.g. an opened file). */
  save: boolean;
}

export interface AutosaveControl {
  status: AutosaveStatus;
  /** Slot of the document being edited. */
  currentId: string;
  /** Saved documents, newest first (including the current one once saved). */
  savedDocuments: DraftSummary[];
  /** The latest saved document, offered at startup until the user answers. */
  suggestedDraft: DraftSummary | null;
  dismissSuggestion: () => void;
  /**
   * Saves the current document, then loads another one into its own slot (design.md §9.2).
   * Resolves to false (and warns) when the current document could not be saved.
   */
  switchDocument: (next: DocumentSwitch) => Promise<boolean>;
  newDocument: () => Promise<void>;
  openSavedDocument: (id: string) => Promise<void>;
  deleteSavedDocument: (id: string) => Promise<void>;
}

async function saveDraft(editor: Editor, id: string): Promise<DraftSummary> {
  const draft = createDraft(
    collectEmbeddedData(editor),
    useDocumentStore.getState().fileName,
    new Date(),
  );
  const summary = summarizeDraft(id, draft);
  const storage = getStorageAdapter();
  // Body first: a summary must never point at a missing body.
  await storage.set('drafts', id, draft);
  await storage.set('draftMeta', id, summary);
  return summary;
}

interface LoadedSummaries {
  summaries: DraftSummary[];
  warnings: string[];
}

/**
 * Reads the saved documents list. The single draft saved before task 1-7 ("drafts/current")
 * gets a summary here, so it appears in the list as an ordinary document.
 */
async function loadSummaries(storage: StorageAdapter): Promise<LoadedSummaries> {
  const stored = await storage.list<unknown>('draftMeta');
  const summaries = stored.flatMap((value) => {
    const summary = parseDraftSummary(value);
    return summary ? [summary] : [];
  });
  const warnings: string[] = [];
  const invalid = stored.length - summaries.length;
  if (invalid > 0) {
    warnings.push(`保存済みの文書のうち${String(invalid)}件の情報を読み込めませんでした`);
  }
  if (summaries.some((summary) => summary.id === LEGACY_DRAFT_KEY)) {
    return { summaries, warnings };
  }
  const legacy = await storage.get<unknown>('drafts', LEGACY_DRAFT_KEY);
  if (legacy === undefined) {
    return { summaries, warnings };
  }
  const parsed = parseDraft(LEGACY_DRAFT_KEY, legacy, createExtensions());
  if (!parsed.ok) {
    // Unreadable and not listed, so it could never be opened or deleted: remove it.
    await storage.delete('drafts', LEGACY_DRAFT_KEY);
    warnings.push(`前回の自動保存データを読み込めなかったため削除しました（${parsed.error}）`);
    return { summaries, warnings };
  }
  const summary = summarizeDraft(LEGACY_DRAFT_KEY, parsed.draft);
  await storage.set('draftMeta', LEGACY_DRAFT_KEY, summary);
  return { summaries: [...summaries, summary], warnings };
}

/** Which slot the editor's document is saved to, outside React state so saves read it at save time. */
interface Slot {
  id: () => string;
  setId: (id: string) => void;
  /** True while a document is being loaded: loading is not an edit to save. */
  isLoading: () => boolean;
  /** Runs `load` with change tracking off. */
  load: (load: () => void) => void;
}

function createSlot(): Slot {
  let id = createDraftId();
  let loading = false;
  return {
    id: () => id,
    setId: (next) => {
      id = next;
    },
    isLoading: () => loading,
    load: (load) => {
      loading = true;
      try {
        load();
      } finally {
        loading = false;
      }
    },
  };
}

function describeSaveError(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  const reason =
    cause instanceof DOMException && cause.name === 'QuotaExceededError'
      ? 'ブラウザの保存容量が不足しています。'
      : errorMessage(error);
  return `自動保存に失敗しました。編集内容はブラウザに保存されていません。HTMLをエクスポートして保存してください。（${reason}）`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Autosaves each document to its own slot in IndexedDB, and lists, opens and deletes
 * the saved documents (design.md §9.2).
 */
export function useAutosave(editor: Editor, onNotice: (notice: Notice) => void): AutosaveControl {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const [slot] = useState(createSlot);
  const [currentId, setCurrentId] = useState(slot.id);
  const [savedDocuments, setSavedDocuments] = useState<DraftSummary[]>([]);
  const [suggestedDraft, setSuggestedDraft] = useState<DraftSummary | null>(null);
  const [autosaver] = useState<Autosaver>(() => {
    let previous: AutosaveStatus['kind'] = 'idle';
    return createAutosaver({
      save: async () => {
        const summary = await saveDraft(editor, slot.id());
        setSavedDocuments((list) => upsertDraftSummary(list, summary));
      },
      delayMs: AUTOSAVE_DELAY_MS,
      onStatus: (next) => {
        setStatus(next);
        // Warn once per run of failures; the header keeps showing the failed state.
        if (next.kind === 'error' && previous !== 'error') {
          console.error('Autosave failed', next.error);
          onNotice({ kind: 'error', message: describeSaveError(next.error) });
        }
        if (next.kind !== 'saving') {
          previous = next.kind;
        }
      },
    });
  });

  // Saved documents, and the latest one to offer at startup.
  useEffect(() => {
    let cancelled = false;
    loadSummaries(getStorageAdapter()).then(
      ({ summaries, warnings }) => {
        if (cancelled) return;
        const [warning] = warnings;
        if (warning) {
          onNotice({ kind: 'warning', message: warning });
        }
        // Keep what the current document saved while the list was loading.
        setSavedDocuments((list) => list.reduce(upsertDraftSummary, sortDraftSummaries(summaries)));
        setSuggestedDraft(sortDraftSummaries(summaries).find((s) => s.id !== slot.id()) ?? null);
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error('Failed to read the saved documents', error);
        onNotice({
          kind: 'warning',
          message: `保存済みの文書を確認できませんでした（${errorMessage(error)}）`,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [slot, onNotice]);

  // Save on body and document info changes, and before the page goes away.
  useEffect(() => {
    const schedule = () => {
      if (!slot.isLoading()) {
        autosaver.schedule();
      }
    };
    const flush = () => {
      void autosaver.flush();
    };
    editor.on('update', schedule);
    const unsubscribe = useDocumentStore.subscribe(schedule);
    window.addEventListener('pagehide', flush);
    return () => {
      editor.off('update', schedule);
      unsubscribe();
      window.removeEventListener('pagehide', flush);
    };
  }, [editor, autosaver, slot]);

  const switchDocument = async ({ load, id, save }: DocumentSwitch): Promise<boolean> => {
    await autosaver.flush();
    if (autosaver.hasPendingChanges()) {
      onNotice({
        kind: 'error',
        message:
          '編集中の文書を保存できなかったため、文書を切り替えませんでした。HTMLをエクスポートして保存してください。',
      });
      return false;
    }
    slot.load(load);
    const nextId = id ?? createDraftId();
    slot.setId(nextId);
    setCurrentId(nextId);
    setSuggestedDraft(null);
    setStatus({ kind: 'idle' });
    if (save) {
      autosaver.schedule();
    }
    return true;
  };

  const newDocument = async () => {
    await switchDocument({
      save: false,
      load: () => {
        replaceDocumentBody(editor, EMPTY_DOC);
        useDocumentStore.getState().resetForImportedBody(null);
      },
    });
  };

  const openSavedDocument = async (id: string) => {
    let stored: unknown;
    try {
      stored = await getStorageAdapter().get<unknown>('drafts', id);
    } catch (error: unknown) {
      console.error(`Failed to read the saved document "${id}"`, error);
      onNotice({ kind: 'error', message: `文書を読み込めませんでした（${errorMessage(error)}）` });
      return;
    }
    if (stored === undefined) {
      onNotice({ kind: 'error', message: '文書の保存データが見つかりませんでした' });
      return;
    }
    const parsed = parseDraft(id, stored, createExtensions());
    if (!parsed.ok) {
      onNotice({ kind: 'error', message: `文書を読み込めませんでした（${parsed.error}）` });
      return;
    }
    const { draft } = parsed;
    await switchDocument({
      id,
      save: false,
      load: () => {
        replaceDocumentBody(editor, draft.data.state.doc as JSONContent);
        useDocumentStore.getState().restore(draft.data, draft.fileName);
      },
    });
  };

  const deleteSavedDocument = async (id: string) => {
    if (id === slot.id()) {
      return;
    }
    try {
      const storage = getStorageAdapter();
      // Body first: if removing the summary fails, the entry stays listed and can be deleted again.
      await storage.delete('drafts', id);
      await storage.delete('draftMeta', id);
    } catch (error: unknown) {
      console.error(`Failed to delete the saved document "${id}"`, error);
      onNotice({ kind: 'error', message: `文書を削除できませんでした（${errorMessage(error)}）` });
      return;
    }
    setSavedDocuments((list) => list.filter((s) => s.id !== id));
    setSuggestedDraft((suggested) => (suggested?.id === id ? null : suggested));
  };

  return {
    status,
    currentId,
    savedDocuments,
    suggestedDraft,
    dismissSuggestion: () => {
      setSuggestedDraft(null);
    },
    switchDocument,
    newDocument,
    openSavedDocument,
    deleteSavedDocument,
  };
}
