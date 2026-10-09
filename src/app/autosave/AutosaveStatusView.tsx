import type { AutosaveStatus } from '../../core/draft';

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/** Autosave state in the header ("自動保存済み 02:41"). */
export function AutosaveStatusView({ status }: { status: AutosaveStatus }) {
  switch (status.kind) {
    case 'idle':
      return null;
    case 'saving':
      return (
        <span className="autosave-status" role="status">
          保存中…
        </span>
      );
    case 'saved':
      return (
        <span className="autosave-status is-saved" role="status">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3 8.5l3 3 7-7" />
          </svg>
          自動保存済み {formatTime(status.at)}
        </span>
      );
    case 'error':
      return (
        <span className="autosave-status is-error" role="status">
          自動保存に失敗しました
        </span>
      );
  }
}
