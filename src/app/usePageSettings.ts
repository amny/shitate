import { resolvePageSettings } from '../core/pdf';
import type { PageSettings } from '../core/model';
import { useDocumentStore } from './store/documentStore';

/** Page settings in effect: the document's override, else the theme's (design.md §10.1). */
export function usePageSettings(): PageSettings {
  const theme = useDocumentStore((state) => state.theme);
  const override = useDocumentStore((state) => state.settingsOverride);
  return resolvePageSettings(theme.settings, override);
}
