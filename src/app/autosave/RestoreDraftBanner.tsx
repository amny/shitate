import type { Draft } from '../../core/draft';

export interface RestoreDraftBannerProps {
  draft: Draft;
  onRestore: () => void;
  onDiscard: () => void;
}

function formatSavedAt(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Asks whether to restore the previous session's draft (design.md §9.2). */
export function RestoreDraftBanner({ draft, onRestore, onDiscard }: RestoreDraftBannerProps) {
  const title = draft.data.state.meta.title || draft.fileName;
  return (
    <div className="restore-banner" role="region" aria-label="前回の編集内容">
      <p>
        前回の編集内容を復元しますか？
        <span className="restore-banner-detail">
          {title ? `「${title}」` : ''}
          {formatSavedAt(draft.savedAt)} に自動保存
        </span>
      </p>
      <div className="restore-banner-actions">
        <button type="button" className="is-primary" onClick={onRestore}>
          復元する
        </button>
        <button type="button" onClick={onDiscard}>
          破棄する
        </button>
      </div>
    </div>
  );
}
