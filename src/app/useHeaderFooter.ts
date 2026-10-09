import { resolveHeaderFooter } from '../core/theme/themeVars';
import type { HeaderFooterSettings } from '../core/theme/themeVars';
import { useDocumentStore } from './store/documentStore';

/** Logo and copyright in effect: the document's override, else the theme's settings. */
export function useHeaderFooter(): HeaderFooterSettings {
  const theme = useDocumentStore((state) => state.theme);
  const override = useDocumentStore((state) => state.settingsOverride);
  return resolveHeaderFooter(theme.settings, override);
}
