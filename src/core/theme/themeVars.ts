import { escapeCssString } from '../export/escape';
import type { DocumentState, ThemeSettings } from '../model';

/** Header / footer contents in effect for a document. */
export interface HeaderFooterSettings {
  logoDataUri?: string | undefined;
  copyright?: string | undefined;
}

/**
 * Logo and copyright in effect: each item from the document's override when it has one,
 * else from the theme (design.md §7.2). An empty copyright override hides the theme's.
 */
export function resolveHeaderFooter(
  theme: ThemeSettings,
  override: DocumentState['settingsOverride'],
): HeaderFooterSettings {
  return {
    logoDataUri: override?.logoDataUri ?? theme.logoDataUri,
    copyright: override?.copyright ?? theme.copyright,
  };
}

/** True when the document overrides the theme's logo or copyright. */
export function overridesHeaderFooter(override: DocumentState['settingsOverride']): boolean {
  return override?.logoDataUri !== undefined || override?.copyright !== undefined;
}

/** Values turned into CSS variables. */
export interface ThemeVarsInput extends HeaderFooterSettings {
  /** Base font size in pt (page settings, design.md §10.1). */
  baseFontPt?: number | undefined;
}

/**
 * CSS variables for the theme (design.md §8.1):
 * `:root{--header-logo:url("…");--copyright:"…";--base-font-size:10.5pt;}`.
 * Strings are escaped as CSS strings; the caller still protects the <style> element
 * (escapeStyleContent). Variables without a value are left out.
 */
export function buildThemeVars(settings: ThemeVarsInput): string {
  const declarations: string[] = [];
  if (settings.logoDataUri) {
    declarations.push(`--header-logo:url("${escapeCssString(settings.logoDataUri)}");`);
  }
  if (settings.copyright) {
    declarations.push(`--copyright:"${escapeCssString(settings.copyright)}";`);
  }
  if (settings.baseFontPt !== undefined && Number.isFinite(settings.baseFontPt)) {
    declarations.push(`--base-font-size:${String(settings.baseFontPt)}pt;`);
  }
  return `:root{${declarations.join('')}}`;
}
