import { useId } from 'react';
import type { Theme } from '../../core/model';
import {
  BUILTIN_THEME_DESCRIPTIONS,
  BUILTIN_THEMES,
  getBuiltinTheme,
  isCurrentBuiltin,
} from '../../core/theme/builtinThemes';
import { useDocumentStore } from '../store/documentStore';
import { useThemeStore } from '../themes/themeStore';

interface ThemeOption {
  key: string;
  theme: Theme;
  description: string;
  badge: string | null;
}

function userThemeDescription(theme: Theme): string {
  const base = theme.baseId === undefined ? undefined : getBuiltinTheme(theme.baseId);
  return base ? `${base.name}をもとに編集` : 'ユーザーテーマ';
}

/** The user theme the document uses, when the document's copy is the same as the saved one. */
function matchingUserTheme(theme: Theme, userThemes: readonly Theme[]): Theme | undefined {
  return userThemes.find((t) => t.id === theme.id && t.css === theme.css);
}

/** Built-ins, then user themes, then the theme embedded in the opened file (design.md §8.4). */
function buildOptions(userThemes: readonly Theme[], documentTheme: Theme | null): ThemeOption[] {
  const options: ThemeOption[] = [
    ...BUILTIN_THEMES.map((theme) => ({
      key: `builtin:${theme.id}`,
      theme,
      description: BUILTIN_THEME_DESCRIPTIONS[theme.id] ?? '',
      badge: 'ビルトイン',
    })),
    ...userThemes.map((theme) => ({
      key: `user:${theme.id}`,
      theme,
      description: userThemeDescription(theme),
      badge: null,
    })),
  ];
  if (documentTheme && !matchingUserTheme(documentTheme, userThemes)) {
    options.push({
      key: 'document',
      theme: documentTheme,
      description: 'この文書に含まれていたテーマ',
      badge: null,
    });
  }
  return options;
}

function optionKeyOf(theme: Theme, userThemes: readonly Theme[]): string {
  if (isCurrentBuiltin(theme)) return `builtin:${theme.id}`;
  return matchingUserTheme(theme, userThemes) ? `user:${theme.id}` : 'document';
}

interface ThemeSectionProps {
  /** Opens the theme editor for the selected theme. */
  onEditTheme: () => void;
}

/** Theme picker (design: 文書設定 > テーマ). */
export function ThemeSection({ onEditTheme }: ThemeSectionProps) {
  const theme = useDocumentStore((state) => state.theme);
  const documentTheme = useDocumentStore((state) => state.documentTheme);
  const userThemes = useThemeStore((state) => state.userThemes);
  const setTheme = useDocumentStore((state) => state.setTheme);
  const headingId = useId();
  const selectedKey = optionKeyOf(theme, userThemes);

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        テーマ
      </h2>
      <div className="theme-options" role="radiogroup" aria-labelledby={headingId}>
        {buildOptions(userThemes, documentTheme).map((option) => (
          <label
            key={option.key}
            className={option.key === selectedKey ? 'theme-option is-selected' : 'theme-option'}
          >
            <input
              type="radio"
              name="theme"
              checked={option.key === selectedKey}
              onChange={() => {
                setTheme(option.theme);
              }}
            />
            <span className="theme-option-text">
              <span className="theme-option-name">{option.theme.name}</span>
              <span className="theme-option-description">{option.description}</span>
            </span>
            {option.badge && <span className="theme-option-badge">{option.badge}</span>}
          </label>
        ))}
      </div>
      <button type="button" className="settings-button" onClick={onEditTheme}>
        テーマを編集…
      </button>
    </section>
  );
}
