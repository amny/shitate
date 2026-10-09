import type { Editor, JSONContent } from '@tiptap/react';
import { useEffect, useState } from 'react';
import { getStorageAdapter } from '../../adapters';
import { createAutosaver, CURRENT_DRAFT_KEY, createDraft, parseDraft } from '../../core/draft';
import type { AutosaveStatus, Autosaver, Draft } from '../../core/draft';
import { createExtensions } from '../../editor/createEditor';
import { collectEmbeddedData } from '../documentState';
import type { Notice } from '../notice';
import { useDocumentStore } from '../store/documentStore';

/** design.md §9.2: save 1 second after the last change. */
export const AUTOSAVE_DELAY_MS = 1000;

export interface AutosaveControl {
  status: AutosaveStatus;
  /** A draft from the previous session waiting for the user's decision. */
  pendingDraft: Draft | null;
  restoreDraft: () => void;
  discardDraft: () => Promise<void>;
}

async function saveDraft(editor: Editor): Promise<void> {
  const draft = createDraft(
    collectEmbeddedData(editor),
    useDocumentStore.getState().fileName,
    new Date(),
  );
  await getStorageAdapter().set('drafts', CURRENT_DRAFT_KEY, draft);
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
 * Autosaves the document to IndexedDB and offers to restore the previous draft (design.md §9.2).
 * Saving stays paused until the user has answered the restore question, so that the empty
 * startup document never overwrites the draft.
 */
export function useAutosave(editor: Editor, onNotice: (notice: Notice) => void): AutosaveControl {
  const [status, setStatus] = useState<AutosaveStatus>({ kind: 'idle' });
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [autosaver] = useState<Autosaver>(() => {
    let previous: AutosaveStatus['kind'] = 'idle';
    return createAutosaver({
      save: () => saveDraft(editor),
      delayMs: AUTOSAVE_DELAY_MS,
      paused: true,
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

  // Look for a draft from the previous session.
  useEffect(() => {
    let cancelled = false;
    getStorageAdapter()
      .get<unknown>('drafts', CURRENT_DRAFT_KEY)
      .then(
        (stored) => {
          if (cancelled) return;
          if (stored === undefined) {
            autosaver.resume();
            return;
          }
          const parsed = parseDraft(stored, createExtensions());
          if (parsed.ok) {
            setPendingDraft(parsed.draft);
          } else {
            onNotice({
              kind: 'warning',
              message: `前回の自動保存データを読み込めませんでした（${parsed.error}）`,
            });
            autosaver.resume();
          }
        },
        (error: unknown) => {
          if (cancelled) return;
          console.error('Failed to read the autosaved draft', error);
          onNotice({
            kind: 'warning',
            message: `前回の自動保存データを確認できませんでした（${errorMessage(error)}）`,
          });
          autosaver.resume();
        },
      );
    return () => {
      cancelled = true;
    };
  }, [autosaver, onNotice]);

  // Save on body and document info changes, and before the page goes away.
  useEffect(() => {
    const schedule = () => {
      autosaver.schedule();
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
  }, [editor, autosaver]);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    editor
      .chain()
      .setContent(pendingDraft.data.state.doc as JSONContent)
      .focus('start')
      .run();
    useDocumentStore.getState().restore(pendingDraft.data, pendingDraft.fileName);
    setPendingDraft(null);
    autosaver.resume();
  };

  const discardDraft = async () => {
    try {
      await getStorageAdapter().delete('drafts', CURRENT_DRAFT_KEY);
    } catch (error: unknown) {
      console.error('Failed to delete the autosaved draft', error);
      onNotice({
        kind: 'error',
        message: `前回の自動保存データを削除できませんでした（${errorMessage(error)}）`,
      });
    }
    setPendingDraft(null);
    autosaver.resume();
  };

  return { status, pendingDraft, restoreDraft, discardDraft };
}
