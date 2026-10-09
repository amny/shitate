import { buildThemeVars } from '../core/theme/themeVars';
import { useDocumentStore } from './store/documentStore';
import { useHeaderFooter } from './useHeaderFooter';
import { usePageSettings } from './usePageSettings';

/**
 * Applies the selected theme CSS and its variables (design.md §8.1) to the editor. The CSS is
 * scoped under `.doc` (theme contract), so the editing UI is not affected.
 */
export function ThemeStyle() {
  const theme = useDocumentStore((state) => state.theme);
  const baseFontPt = usePageSettings().baseFontPt;
  const vars = buildThemeVars({ ...useHeaderFooter(), baseFontPt });
  return (
    <>
      <style data-theme-vars="">{vars}</style>
      <style data-theme-id={theme.id}>{theme.css}</style>
    </>
  );
}
