import { renderCover, renderFooter, renderHeader, renderRevisions } from '../core/export';
import type { SettingsTab } from './panels/settingsTabs';
import { useDocumentStore } from './store/documentStore';
import { useHeaderFooter } from './useHeaderFooter';

interface PreviewProps {
  /** Opens the settings tab where the clicked part is edited. */
  onEdit: (tab: SettingsTab) => void;
}

interface PreviewBlockProps {
  html: string;
  title: string;
  onClick: () => void;
}

/** Escaped markup shared with the export (core/export/templates.ts); '' renders nothing. */
function PreviewBlock({ html, title, onClick }: PreviewBlockProps) {
  if (html === '') return null;
  return (
    <div
      className="doc-preface"
      title={title}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
    />
  );
}

/**
 * Header, cover and revision history shown above the body, with the export's own templates
 * (design.md §8.1), so the editor matches the output. Edited in the settings panel.
 */
export function DocumentPreface({ onEdit }: PreviewProps) {
  const meta = useDocumentStore((state) => state.meta);
  const revisions = useDocumentStore((state) => state.revisions);
  const headerFooter = useHeaderFooter();

  return (
    <>
      <PreviewBlock
        html={renderHeader(headerFooter)}
        title="クリックしてヘッダーを編集"
        onClick={() => {
          onEdit('theme');
        }}
      />
      <PreviewBlock
        html={renderCover(meta)}
        title="クリックして表紙を編集"
        onClick={() => {
          onEdit('cover');
        }}
      />
      <PreviewBlock
        html={renderRevisions(revisions)}
        title="クリックして改訂履歴を編集"
        onClick={() => {
          onEdit('revisions');
        }}
      />
    </>
  );
}

/** Footer shown below the body (design.md §8.1). */
export function DocumentFooterPreview({ onEdit }: PreviewProps) {
  return (
    <PreviewBlock
      html={renderFooter(useHeaderFooter())}
      title="クリックしてフッターを編集"
      onClick={() => {
        onEdit('theme');
      }}
    />
  );
}
