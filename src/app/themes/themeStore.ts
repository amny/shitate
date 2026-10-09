import { create } from 'zustand';
import { getStorageAdapter } from '../../adapters';
import type { Theme } from '../../core/model';
import { parseStoredThemes } from '../../core/theme/editing';

interface ThemeStoreState {
  /** User themes saved in the `themes` store (design.md §8.4), sorted by name. */
  userThemes: Theme[];
  /** Reads the user themes; resolves to the number of stored values that were skipped. */
  loadUserThemes: () => Promise<number>;
  /** Saves (adds or replaces) a user theme. */
  saveUserTheme: (theme: Theme) => Promise<void>;
  deleteUserTheme: (id: string) => Promise<void>;
}

export const useThemeStore = create<ThemeStoreState>()((set) => ({
  userThemes: [],
  loadUserThemes: async () => {
    const stored = await getStorageAdapter().list<unknown>('themes');
    const { themes, invalid } = parseStoredThemes(stored);
    set({ userThemes: themes });
    return invalid;
  },
  saveUserTheme: async (theme) => {
    if (theme.builtIn) {
      throw new Error(`Built-in theme "${theme.id}" cannot be saved as a user theme`);
    }
    await getStorageAdapter().set('themes', theme.id, theme);
    set((state) => ({
      userThemes: [...state.userThemes.filter((t) => t.id !== theme.id), theme].sort((a, b) =>
        a.name.localeCompare(b.name, 'ja'),
      ),
    }));
  },
  deleteUserTheme: async (id) => {
    await getStorageAdapter().delete('themes', id);
    set((state) => ({ userThemes: state.userThemes.filter((t) => t.id !== id) }));
  },
}));
