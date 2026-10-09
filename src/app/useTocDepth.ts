import { resolveTocDepth } from '../core/export';
import type { TocDepth } from '../core/export';
import { useDocumentStore } from './store/documentStore';

/** The TOC depth in effect: this document's override, else the theme's setting. */
export function useTocDepth(): TocDepth {
  const theme = useDocumentStore((state) => state.theme);
  const override = useDocumentStore((state) => state.settingsOverride);
  return resolveTocDepth(theme.settings, override);
}
