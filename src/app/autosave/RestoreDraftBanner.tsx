import { draftDisplayName } from '../../core/draft';
import type { DraftSummary } from '../../core/draft';
import { formatSavedAt } from './formatSavedAt';

export interface RestoreDraftBannerProps {
  draft: DraftSummary;
  onOpen: () => void;
  onShowList: () => void;
  onDismiss: () => void;
}

/** Offers the latest saved document at startup (design.md §9.2). */
export function RestoreDraftBanner({
  draft,
  onOpen,
  onShowList,
  onDismiss,
}: RestoreDraftBannerProps) {
  return (
    <div className="restore-banner" role="region" aria-label="前回の編集内容">
      <p>
        前回の文書を開きますか？
        <span className="restore-banner-detail">
          「{draftDisplayName(draft)}」{formatSavedAt(draft.savedAt)} に保存
        </span>
      </p>
      <div className="restore-banner-actions">
        <button type="button" className="is-primary" onClick={onOpen}>
          開く
        </button>
        <button type="button" onClick={onShowList}>
          保存済みの文書…
        </button>
        <button type="button" onClick={onDismiss}>
          閉じる
        </button>
      </div>
    </div>
  );
}
