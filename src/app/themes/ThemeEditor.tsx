import type { Editor } from '@tiptap/react';
import { useId, useMemo, useState } from 'react';
import type { Theme } from '../../core/model';
import { BUILTIN_THEMES } from '../../core/theme/builtinThemes';
import { checkThemeContract, formatViolationForUser } from '../../core/theme/contract';
import { baseThemeOf, createEditableTheme, resetThemeCss } from '../../core/theme/editing';
import { getFileAdapter } from '../../adapters';
import {
  duplicateTheme,
  parseThemeFile,
  planThemeImport,
  serializeThemeFile,
  themeFileName,
} from '../../core/theme/themeFile';
import type { Notice } from '../notice';
import { useDocumentStore } from '../store/documentStore';
import { ContractReference } from './ContractReference';
import { CssEditor } from './CssEditor';
import { ThemePreview } from './ThemePreview';
import { ThemeSettingsForm } from './ThemeSettingsForm';
import { useThemeStore } from './themeStore';

type EditorTab = 'css' | 'settings' | 'classes';

const TABS: readonly { id: EditorTab; label: string }[] = [
  { id: 'css', label: 'CSS' },
  { id: 'settings', label: '設定値' },
  { id: 'classes', label: '使えるクラス' },
];

export const DISCARD_THEME_CHANGES_MESSAGE = '保存していない変更があります。破棄しますか？';

interface ThemeEditorProps {
  editor: Editor;
  onClose: () => void;
}

/** What is being edited: the editable copy and the version it started from. */
interface EditSession {
  /** The theme picked in the list (a built-in stays a built-in here). */
  source: Theme;
  /** The version last saved (or the fresh copy); used to detect unsaved changes. */
  saved: Theme;
  draft: Theme;
  /** True once the draft has been saved as a user theme. */
  stored: boolean;
}

function startSession(source: Theme, userThemes: readonly Theme[]): EditSession {
  const draft = createEditableTheme(source);
  return {
    source,
    saved: draft,
    draft,
    stored: userThemes.some((t) => t.id === draft.id),
  };
}

/**
 * Theme editor (design: ThemeEditor, design.md §8.4). Built-ins are edited as a copy saved as a
 * user theme; the CSS must follow the theme contract to be saved.
 */
export function ThemeEditor({ editor, onClose }: ThemeEditorProps) {
  // Shown inside the editor: the app's notices are covered by this full-screen view.
  const [notice, setNotice] = useState<Notice | null>(null);
  const onError = (message: string) => {
    setNotice({ kind: 'error', message });
  };
  const documentTheme = useDocumentStore((state) => state.theme);
  const setDocumentTheme = useDocumentStore((state) => state.setTheme);
  const userThemes = useThemeStore((state) => state.userThemes);
  const saveUserTheme = useThemeStore((state) => state.saveUserTheme);
  const deleteUserTheme = useThemeStore((state) => state.deleteUserTheme);
  const keepThemeInDocument = useDocumentStore((state) => state.keepThemeInDocument);
  const [session, setSession] = useState(() => startSession(documentTheme, userThemes));
  const [tab, setTab] = useState<EditorTab>('css');
  const [saving, setSaving] = useState(false);
  const id = useId();

  const { draft, source } = session;
  const dirty = JSON.stringify(draft) !== JSON.stringify(session.saved);
  const violations = useMemo(() => checkThemeContract(draft.css), [draft.css]);
  const base = baseThemeOf(draft);
  const nameError = draft.name.trim() === '' ? 'テーマ名を入力してください' : null;
  const canSave =
    !saving && violations.length === 0 && nameError === null && (dirty || !session.stored);

  const update = (patch: Partial<Theme>) => {
    setSession((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  };

  /** Asks before throwing away unsaved changes. */
  const confirmDiscard = () => !dirty || window.confirm(DISCARD_THEME_CHANGES_MESSAGE);

  const switchTo = (theme: Theme) => {
    if ((theme.id === source.id && theme.builtIn === source.builtIn) || !confirmDiscard()) return;
    setSession(startSession(theme, userThemes));
  };

  const save = async () => {
    const theme: Theme = { ...draft, name: draft.name.trim() };
    setSaving(true);
    setNotice(null);
    try {
      await saveUserTheme(theme);
      setDocumentTheme(theme);
      setSession({ source: theme, saved: theme, draft: theme, stored: true });
    } catch (error: unknown) {
      console.error('Failed to save the theme', error);
      onError(
        `テーマを保存できませんでした。${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  /** The saved theme the list buttons act on (the built-in itself for an unsaved copy). */
  const target = session.stored ? session.saved : source;
  const savedFirst = dirty ? '保存してから実行してください' : undefined;

  const runAction = async (label: string, action: () => Promise<void>) => {
    setNotice(null);
    try {
      await action();
    } catch (error: unknown) {
      console.error(`Theme action failed: ${label}`, error);
      onError(
        `${label}できませんでした。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const duplicate = () =>
    runAction('テーマを複製', async () => {
      const names = [...BUILTIN_THEMES, ...userThemes].map((t) => t.name);
      const copy = duplicateTheme(target, names);
      await saveUserTheme(copy);
      setSession(startSession(copy, [copy]));
    });

  const exportTheme = () =>
    runAction('テーマを書き出し', () =>
      getFileAdapter().saveFile(
        themeFileName(target),
        serializeThemeFile(target),
        'application/json',
      ),
    );

  const importTheme = () =>
    runAction('テーマを読み込み', async () => {
      const file = await getFileAdapter().openFile(['.json']);
      if (!file) return;
      const parsed = parseThemeFile(file.text);
      if (!parsed.ok) {
        onError(`「${file.name}」を読み込めませんでした。${parsed.error}`);
        return;
      }
      if (!confirmDiscard()) return;
      const plan = planThemeImport(parsed.theme, userThemes);
      if (plan.kind === 'exists') {
        setNotice({
          kind: 'warning',
          message: `「${plan.theme.name}」は既にユーザーテーマにあります`,
        });
      } else {
        await saveUserTheme(plan.theme);
      }
      setSession(startSession(plan.theme, [plan.theme]));
    });

  const deleteTheme = () =>
    runAction('テーマを削除', async () => {
      const inUse = documentTheme.id === target.id;
      const message = inUse
        ? `「${target.name}」はこの文書で使用中です。削除しても、この文書には埋め込まれたテーマとして残ります。削除しますか？`
        : `「${target.name}」を削除しますか？`;
      if (!window.confirm(message)) return;
      await deleteUserTheme(target.id);
      keepThemeInDocument(target.id);
      setSession(startSession(BUILTIN_THEMES[0] ?? target, []));
    });

  const listItem = (theme: Theme, description: string | null) => {
    const selected = theme.id === source.id && theme.builtIn === source.builtIn;
    return (
      <button
        key={`${theme.builtIn ? 'builtin' : 'user'}:${theme.id}`}
        type="button"
        className={selected ? 'theme-list-item is-selected' : 'theme-list-item'}
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          switchTo(theme);
        }}
      >
        <span className="theme-list-name">{theme.name}</span>
        {description && <span className="theme-list-description">{description}</span>}
      </button>
    );
  };

  const isUnsavedCopy = source.builtIn && !session.stored;

  return (
    <div className="theme-editor" role="dialog" aria-modal="true" aria-label="テーマ編集">
      <header className="app-header">
        <span className="app-brand">Shitate</span>
        <span className="app-header-divider" aria-hidden="true" />
        <button
          type="button"
          className="app-header-button"
          onClick={() => {
            if (confirmDiscard()) onClose();
          }}
        >
          ‹ 編集に戻る
        </button>
        <span className="pdf-preview-title">テーマ編集</span>
        <span className="app-header-spacer" />
        <button
          type="button"
          className="app-header-button"
          disabled={!base || base.css === draft.css}
          title={
            base
              ? `${base.name}のCSSに戻します（保存で確定）`
              : 'ビルトインをもとにしたテーマで使えます'
          }
          onClick={() => {
            const reset = resetThemeCss(draft);
            if (reset) update({ css: reset.css });
          }}
        >
          初期状態に戻す
        </button>
        <button
          type="button"
          className="app-header-button"
          disabled={!dirty}
          onClick={() => {
            if (confirmDiscard()) setSession((current) => ({ ...current, draft: current.saved }));
          }}
        >
          キャンセル
        </button>
        <button
          type="button"
          className="app-header-button is-primary"
          disabled={!canSave}
          onClick={() => {
            void save();
          }}
        >
          保存
        </button>
      </header>

      {notice && (
        <div className={`app-notice is-${notice.kind}`} role="alert">
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
            }}
          >
            閉じる
          </button>
        </div>
      )}
      <div className="theme-editor-body">
        <nav className="theme-list" aria-label="テーマ一覧">
          <div className="theme-list-group">
            <div className="theme-list-heading">ビルトイン</div>
            {BUILTIN_THEMES.map((theme) => listItem(theme, null))}
          </div>
          <div className="theme-list-group">
            <div className="theme-list-heading">ユーザーテーマ</div>
            {userThemes.length === 0 && <p className="settings-note">まだありません</p>}
            {userThemes.map((theme) => {
              const themeBase = baseThemeOf(theme);
              return listItem(theme, themeBase ? `${themeBase.name}をもとに編集` : null);
            })}
          </div>
          <div className="theme-list-actions">
            <button
              type="button"
              className="settings-button"
              disabled={dirty}
              title={savedFirst ?? `「${target.name}」を複製します`}
              onClick={() => {
                void duplicate();
              }}
            >
              テーマを複製
            </button>
            <div className="theme-list-actions-row">
              <button
                type="button"
                className="settings-button"
                onClick={() => {
                  void importTheme();
                }}
              >
                読み込み
              </button>
              <button
                type="button"
                className="settings-button"
                disabled={dirty}
                title={savedFirst ?? `「${target.name}」をファイルに書き出します`}
                onClick={() => {
                  void exportTheme();
                }}
              >
                書き出し
              </button>
            </div>
            <button
              type="button"
              className="settings-button is-danger"
              disabled={target.builtIn || !session.stored}
              title={
                target.builtIn || !session.stored
                  ? 'ユーザーテーマだけ削除できます'
                  : `「${target.name}」を削除します`
              }
              onClick={() => {
                void deleteTheme();
              }}
            >
              削除
            </button>
          </div>
        </nav>

        <section className="theme-editor-main" aria-label="テーマの内容">
          <div className="theme-editor-name">
            <div className="settings-field">
              <label htmlFor={`${id}-name`}>テーマ名</label>
              <input
                id={`${id}-name`}
                type="text"
                className="settings-input"
                value={draft.name}
                aria-invalid={nameError !== null}
                onChange={(event) => {
                  update({ name: event.target.value });
                }}
              />
            </div>
            {base && <span className="theme-editor-base">元のテーマ：{base.name}</span>}
          </div>
          {nameError && (
            <p className="settings-error" role="alert">
              {nameError}
            </p>
          )}
          <div className="theme-editor-tabs" role="tablist" aria-label="編集する内容">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className="theme-editor-tab"
                onClick={() => {
                  setTab(t.id);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="theme-editor-panel" role="tabpanel">
            {tab === 'css' && (
              <>
                {/* Keyed so switching themes starts a fresh editor (and undo history). */}
                <CssEditor
                  key={draft.id}
                  label="テーマのCSS"
                  value={draft.css}
                  onChange={(css) => {
                    update({ css });
                  }}
                />
                {violations.length > 0 && (
                  <div className="theme-violations" role="alert">
                    <strong>テーマ契約に合わないため保存できません（{violations.length}件）</strong>
                    <ul>
                      {violations.slice(0, 20).map((v, index) => (
                        <li key={index}>{formatViolationForUser(v)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {tab === 'settings' && (
              <ThemeSettingsForm
                value={draft.settings}
                onChange={(settings) => {
                  update({ settings });
                }}
                onError={onError}
              />
            )}
            {tab === 'classes' && <ContractReference />}
          </div>
        </section>

        <ThemePreview editor={editor} theme={draft} />
      </div>

      <div className="theme-editor-notice" role="status">
        {isUnsavedCopy
          ? `ビルトインテーマは直接変更されません。編集内容は「${draft.name}」として保存され、「初期状態に戻す」で${source.name}の内容に戻せます。`
          : base
            ? `ユーザーテーマ「${draft.name}」を編集しています。「初期状態に戻す」で${base.name}の内容に戻せます。`
            : `ユーザーテーマ「${draft.name}」を編集しています。`}
      </div>
    </div>
  );
}
