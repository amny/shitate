import { resolveNumberingStartLevel } from '../core/labels';
import type { NumberingStartLevel } from '../core/labels';
import { useDocumentStore } from './store/documentStore';

/** The heading level numbered as "1": this document's override, else the theme's setting. */
export function useNumberingStartLevel(): NumberingStartLevel {
  const theme = useDocumentStore((state) => state.theme);
  const override = useDocumentStore((state) => state.settingsOverride);
  return resolveNumberingStartLevel(theme.settings, override);
}
