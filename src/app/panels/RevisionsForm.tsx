import { useId } from 'react';
import type { Revision } from '../../core/model';
import { useDocumentStore } from '../store/documentStore';

/** Revision history rows (design: 文書設定 > 改訂履歴). Output as a table in the export. */
export function RevisionsForm() {
  const revisions = useDocumentStore((state) => state.revisions);
  const addRevision = useDocumentStore((state) => state.addRevision);

  return (
    <section className="settings-section" aria-label="改訂履歴">
      {revisions.length === 0 && (
        <p className="settings-note">改訂履歴はまだありません。追加すると表として出力されます。</p>
      )}
      <ol className="revision-list">
        {revisions.map((revision, index) => (
          <RevisionCard
            key={revision.id}
            revision={revision}
            index={index}
            isFirst={index === 0}
            isLast={index === revisions.length - 1}
          />
        ))}
      </ol>
      <button
        type="button"
        className="settings-button"
        onClick={() => {
          addRevision(new Date());
        }}
      >
        履歴を追加
      </button>
    </section>
  );
}

interface RevisionCardProps {
  revision: Revision;
  index: number;
  isFirst: boolean;
  isLast: boolean;
}

function RevisionCard({ revision, index, isFirst, isLast }: RevisionCardProps) {
  const updateRevision = useDocumentStore((state) => state.updateRevision);
  const removeRevision = useDocumentStore((state) => state.removeRevision);
  const moveRevision = useDocumentStore((state) => state.moveRevision);
  const baseId = useId();
  const name = `改訂履歴${String(index + 1)}`;
  const update = (patch: Partial<Omit<Revision, 'id'>>) => {
    updateRevision(revision.id, patch);
  };

  return (
    <li className="revision-card" aria-label={name}>
      <div className="revision-card-header">
        <span className="revision-card-index">{index + 1}</span>
        <span className="revision-card-spacer" />
        <button
          type="button"
          className="revision-card-button"
          aria-label={`${name}を上へ`}
          title="上へ"
          disabled={isFirst}
          onClick={() => {
            moveRevision(revision.id, -1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="revision-card-button"
          aria-label={`${name}を下へ`}
          title="下へ"
          disabled={isLast}
          onClick={() => {
            moveRevision(revision.id, 1);
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="revision-card-button is-danger"
          aria-label={`${name}を削除`}
          title="削除"
          onClick={() => {
            removeRevision(revision.id);
          }}
        >
          削除
        </button>
      </div>
      <div className="revision-card-row">
        <div className="settings-field">
          <label htmlFor={`${baseId}-version`}>版</label>
          <input
            id={`${baseId}-version`}
            type="text"
            className="settings-input"
            value={revision.version}
            onChange={(event) => {
              update({ version: event.target.value });
            }}
          />
        </div>
        <div className="settings-field">
          <label htmlFor={`${baseId}-date`}>日付</label>
          <input
            id={`${baseId}-date`}
            type="date"
            className="settings-input"
            value={revision.date}
            required
            onChange={(event) => {
              // Required: clearing the field keeps the previous date.
              if (event.target.value !== '') {
                update({ date: event.target.value });
              }
            }}
          />
        </div>
      </div>
      <div className="settings-field">
        <label htmlFor={`${baseId}-description`}>内容</label>
        <textarea
          id={`${baseId}-description`}
          className="settings-input settings-textarea"
          rows={2}
          value={revision.description}
          onChange={(event) => {
            update({ description: event.target.value });
          }}
        />
      </div>
      <div className="settings-field">
        <label htmlFor={`${baseId}-author`}>担当</label>
        <input
          id={`${baseId}-author`}
          type="text"
          className="settings-input"
          value={revision.author}
          onChange={(event) => {
            update({ author: event.target.value });
          }}
        />
      </div>
    </li>
  );
}
