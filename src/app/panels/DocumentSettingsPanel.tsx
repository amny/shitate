import { useId } from 'react';
import type { KeyboardEvent } from 'react';
import { CoverForm } from './CoverForm';
import { HeaderFooterSection } from './HeaderFooterSection';
import { PageSection } from './PageSection';
import { RevisionsForm } from './RevisionsForm';
import { SETTINGS_TABS } from './settingsTabs';
import type { SettingsTab } from './settingsTabs';
import { ThemeSection } from './ThemeSection';
import { TocSection } from './TocSection';

interface DocumentSettingsPanelProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onError: (message: string) => void;
  onEditTheme: () => void;
}

/** Right-hand "文書設定" panel with the 表紙 / 改訂履歴 / テーマ tabs. */
export function DocumentSettingsPanel({
  tab,
  onTabChange,
  onError,
  onEditTheme,
}: DocumentSettingsPanelProps) {
  const baseId = useId();
  const tabId = (id: SettingsTab) => `${baseId}-tab-${id}`;
  const panelId = `${baseId}-panel`;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const index = SETTINGS_TABS.findIndex((t) => t.id === tab);
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = SETTINGS_TABS[(index + step + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    if (!next) return;
    event.preventDefault();
    onTabChange(next.id);
    document.getElementById(tabId(next.id))?.focus();
  };

  return (
    <aside className="settings-panel" aria-label="文書設定">
      <div className="settings-tabs" role="tablist" aria-label="文書設定" onKeyDown={onKeyDown}>
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            type="button"
            role="tab"
            className="settings-tab"
            aria-selected={t.id === tab}
            aria-controls={panelId}
            tabIndex={t.id === tab ? 0 : -1}
            onClick={() => {
              onTabChange(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id={panelId} className="settings-tab-panel" role="tabpanel" aria-labelledby={tabId(tab)}>
        {tab === 'cover' && <CoverForm />}
        {tab === 'revisions' && <RevisionsForm />}
        {tab === 'theme' && (
          <>
            <ThemeSection onEditTheme={onEditTheme} />
            <HeaderFooterSection onError={onError} />
            <TocSection />
            <PageSection />
          </>
        )}
      </div>
    </aside>
  );
}
