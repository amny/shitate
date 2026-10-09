/** Tabs of the document settings panel (design: 文書設定). */
export type SettingsTab = 'cover' | 'revisions' | 'theme';

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: 'cover', label: '表紙' },
  { id: 'revisions', label: '改訂履歴' },
  { id: 'theme', label: 'テーマ' },
];
