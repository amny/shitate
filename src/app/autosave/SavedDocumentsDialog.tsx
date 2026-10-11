import { useId } from 'react';
import { draftDisplayName } from '../../core/draft';
import type { DraftSummary } from '../../core/draft';
import { formatSavedAt } from './formatSavedAt';

export interface SavedDocumentsDialogProps {
  documents: DraftSummary[];
  /** The document being edited: it cannot be opened again or deleted. */
  currentId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Lists the documents saved in the browser to open or delete (design.md §9.2). */
export function SavedDocumentsDialog({
  documents,
  currentId,
  onOpen,
  onDelete,
  onClose,
}: SavedDocumentsDialogProps) {
  const titleId = useId();
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="saved-documents" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>保存済みの文書</h2>
        <p className="saved-documents-note">
          このブラウザに自動保存された文書です。納品・共有にはHTMLをエクスポートしてください。
        </p>
        {documents.length === 0 ? (
          <p className="saved-documents-empty">保存済みの文書はありません</p>
        ) : (
          <ul className="saved-documents-list">
            {documents.map((doc) => {
              const name = draftDisplayName(doc);
              const isCurrent = doc.id === currentId;
              return (
                <li key={doc.id} className="saved-documents-item" aria-label={name}>
                  <div className="saved-documents-info">
                    <span className="saved-documents-name">
                      {name}
                      {isCurrent && <span className="saved-documents-current">編集中</span>}
                    </span>
                    <span className="saved-documents-detail">
                      {formatSavedAt(doc.savedAt)} に保存
                      {doc.fileName && doc.fileName !== name ? `・${doc.fileName}` : ''}
                    </span>
                  </div>
                  <div className="saved-documents-actions">
                    <button
                      type="button"
                      className="is-primary"
                      disabled={isCurrent}
                      onClick={() => {
                        onOpen(doc.id);
                      }}
                    >
                      開く
                    </button>
                    <button
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        if (
                          window.confirm(`「${name}」を削除しますか？この操作は元に戻せません。`)
                        ) {
                          onDelete(doc.id);
                        }
                      }}
                    >
                      削除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="saved-documents-footer">
          <button type="button" autoFocus onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
