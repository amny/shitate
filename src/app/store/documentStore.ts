import { create } from 'zustand';
import {
  createDefaultMeta,
  createRevision,
  moveRevision,
  removeRevision,
  updateRevision,
} from '../../core/model';
import type {
  DocMeta,
  DocumentState,
  EmbeddedData,
  PageSettings,
  Revision,
  Theme,
  ThemeSettings,
} from '../../core/model';
import { getDefaultTheme, isCurrentBuiltin } from '../../core/theme/builtinThemes';

/**
 * Document state other than the body (the body lives in the editor).
 * design.md §2: app state is kept in Zustand.
 */
export interface DocumentInfo {
  meta: DocMeta;
  revisions: Revision[];
  themeId: string;
  settingsOverride: DocumentState['settingsOverride'];
  /** The theme in use. For a restored file this is the embedded theme. */
  theme: Theme;
  /**
   * The theme embedded in the restored file when it is not a current built-in,
   * kept as a choice in the theme picker after switching to a built-in.
   */
  documentTheme: Theme | null;
  /** Name of the file the document was opened from (shown in the header). */
  fileName: string | null;
}

interface DocumentInfoActions {
  /** Fresh cover info and revisions, keeping the current theme (design.md §6). */
  resetForImportedBody: (fileName: string | null) => void;
  /** Restores everything from an exported file or an autosaved draft. */
  restore: (data: EmbeddedData, fileName: string | null) => void;
  setTheme: (theme: Theme) => void;
  /**
   * After the user theme the document uses is deleted: keep the document's copy as the
   * "theme embedded in this document" choice (design.md §8.4).
   */
  keepThemeInDocument: (deletedThemeId: string) => void;
  updateMeta: (patch: Partial<DocMeta>) => void;
  /** Appends a revision with the cover's version and today's date. */
  addRevision: (today: Date) => void;
  updateRevision: (id: string, patch: Partial<Omit<Revision, 'id'>>) => void;
  removeRevision: (id: string) => void;
  moveRevision: (id: string, offset: -1 | 1) => void;
  /**
   * Turns the document's own logo / copyright on (starting from the theme's values) or off
   * (back to the theme's values) (design.md §8.1).
   */
  setHeaderFooterOverride: (enabled: boolean) => void;
  /** Sets the document's logo; undefined removes it (the theme's logo applies again). */
  setLogoOverride: (logoDataUri: string | undefined) => void;
  setCopyrightOverride: (copyright: string) => void;
  /** Page settings for this document (overrides the theme's, design.md §10.1). */
  setPageOverride: (page: PageSettings) => void;
  /** Back to the theme's page settings. */
  clearPageOverride: () => void;
  /** Depth of the table of contents for this document (overrides the theme's setting). */
  setTocDepth: (depth: ThemeSettings['tocDepth']) => void;
}

export const useDocumentStore = create<DocumentInfo & DocumentInfoActions>()((set) => {
  const theme = getDefaultTheme();
  return {
    meta: createDefaultMeta(new Date()),
    revisions: [],
    themeId: theme.id,
    settingsOverride: undefined,
    theme,
    documentTheme: null,
    fileName: null,
    resetForImportedBody: (fileName) => {
      set({
        meta: createDefaultMeta(new Date()),
        revisions: [],
        settingsOverride: undefined,
        fileName,
      });
    },
    restore: (data, fileName) => {
      set({
        meta: data.state.meta,
        revisions: data.state.revisions,
        themeId: data.state.themeId,
        settingsOverride: data.state.settingsOverride,
        theme: data.theme,
        documentTheme: isCurrentBuiltin(data.theme) ? null : data.theme,
        fileName,
      });
    },
    setTheme: (theme) => {
      set({ theme, themeId: theme.id });
    },
    keepThemeInDocument: (deletedThemeId) => {
      set((state) => (state.theme.id === deletedThemeId ? { documentTheme: state.theme } : {}));
    },
    updateMeta: (patch) => {
      set((state) => ({ meta: { ...state.meta, ...patch } }));
    },
    addRevision: (today) => {
      set((state) => ({
        revisions: [...state.revisions, createRevision(state.meta.version, today)],
      }));
    },
    updateRevision: (id, patch) => {
      set((state) => ({ revisions: updateRevision(state.revisions, id, patch) }));
    },
    removeRevision: (id) => {
      set((state) => ({ revisions: removeRevision(state.revisions, id) }));
    },
    moveRevision: (id, offset) => {
      set((state) => ({ revisions: moveRevision(state.revisions, id, offset) }));
    },
    setHeaderFooterOverride: (enabled) => {
      set((state) => {
        const { logoDataUri, copyright, ...rest } = state.settingsOverride ?? {};
        if (!enabled) {
          return { settingsOverride: Object.keys(rest).length > 0 ? rest : undefined };
        }
        const themeSettings = state.theme.settings;
        const logo = logoDataUri ?? themeSettings.logoDataUri;
        return {
          settingsOverride: {
            ...rest,
            ...(logo === undefined ? {} : { logoDataUri: logo }),
            copyright: copyright ?? themeSettings.copyright ?? '',
          },
        };
      });
    },
    setLogoOverride: (logo) => {
      set((state) => {
        const { logoDataUri: _previous, ...rest } = state.settingsOverride ?? {};
        return { settingsOverride: logo === undefined ? rest : { ...rest, logoDataUri: logo } };
      });
    },
    setCopyrightOverride: (copyright) => {
      set((state) => ({ settingsOverride: { ...state.settingsOverride, copyright } }));
    },
    setPageOverride: (page) => {
      set((state) => ({ settingsOverride: { ...state.settingsOverride, page } }));
    },
    clearPageOverride: () => {
      set((state) => {
        const { page: _page, ...rest } = state.settingsOverride ?? {};
        return { settingsOverride: Object.keys(rest).length > 0 ? rest : undefined };
      });
    },
    setTocDepth: (tocDepth) => {
      set((state) => ({ settingsOverride: { ...state.settingsOverride, tocDepth } }));
    },
  };
});
