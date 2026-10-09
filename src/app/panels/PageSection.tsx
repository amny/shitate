import { useId } from 'react';
import { useDocumentStore } from '../store/documentStore';
import { usePageSettings } from '../usePageSettings';
import { PageSettingsFields } from './PageSettingsFields';

/**
 * Page settings for the PDF (design: 文書設定 > テーマ > ページ, design.md §10.1). Changes are
 * saved as this document's override; the theme is not changed.
 */
export function PageSection() {
  const page = usePageSettings();
  const overriding = useDocumentStore((state) => state.settingsOverride?.page !== undefined);
  const setPage = useDocumentStore((state) => state.setPageOverride);
  const clearPage = useDocumentStore((state) => state.clearPageOverride);
  const id = useId();

  return (
    <section className="settings-section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="settings-heading">
        ページ（PDF）
      </h2>
      <PageSettingsFields value={page} onChange={setPage} />
      <p className="settings-note">
        {overriding
          ? 'この文書だけの設定です。基準文字サイズは編集画面と出力にも反映されます。'
          : 'テーマの設定値を使用中です。変更すると、この文書だけの設定になります。'}
      </p>
      {overriding && (
        <button type="button" className="settings-button" onClick={clearPage}>
          テーマの設定に戻す
        </button>
      )}
    </section>
  );
}
