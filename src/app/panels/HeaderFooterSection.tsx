import { useId } from 'react';
import { getFileAdapter } from '../../adapters';
import { overridesHeaderFooter } from '../../core/theme/themeVars';
import { useDocumentStore } from '../store/documentStore';
import { useHeaderFooter } from '../useHeaderFooter';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

interface HeaderFooterSectionProps {
  onError: (message: string) => void;
}

/**
 * Logo and copyright (design: 文書設定 > テーマ > ヘッダー・フッター, design.md §8.1).
 * Without the override the theme's values are shown read-only.
 */
export function HeaderFooterSection({ onError }: HeaderFooterSectionProps) {
  const overriding = useDocumentStore((state) => overridesHeaderFooter(state.settingsOverride));
  const setOverride = useDocumentStore((state) => state.setHeaderFooterOverride);
  const setLogo = useDocumentStore((state) => state.setLogoOverride);
  const setCopyright = useDocumentStore((state) => state.setCopyrightOverride);
  const { logoDataUri, copyright } = useHeaderFooter();
  const headingId = useId();
  const logoLabelId = useId();
  const copyrightId = useId();
  const overrideId = useId();

  const chooseLogo = async () => {
    try {
      const image = await getFileAdapter().openImage(LOGO_TYPES);
      if (image) {
        setLogo(image.dataUri);
      }
    } catch (error: unknown) {
      console.error('Failed to read the logo image', error);
      onError(
        `ロゴ画像を読み込めませんでした。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="settings-heading">
        ヘッダー・フッター
      </h2>
      <div className="settings-field">
        <span id={logoLabelId}>ロゴ画像</span>
        {logoDataUri ? (
          <div className="logo-setting" role="group" aria-labelledby={logoLabelId}>
            <img className="logo-setting-image" src={logoDataUri} alt="ロゴ画像" />
            {overriding && (
              <div className="logo-setting-actions">
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => {
                    void chooseLogo();
                  }}
                >
                  変更
                </button>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => {
                    setLogo(undefined);
                  }}
                >
                  削除
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="settings-button logo-setting-empty"
            aria-describedby={logoLabelId}
            disabled={!overriding}
            onClick={() => {
              void chooseLogo();
            }}
          >
            {overriding ? '画像を選択（PNG / JPEG / SVG）' : 'ロゴなし'}
          </button>
        )}
      </div>
      <div className="settings-field">
        <label htmlFor={copyrightId}>Copyright</label>
        <input
          id={copyrightId}
          type="text"
          className="settings-input"
          value={copyright ?? ''}
          placeholder={overriding ? '© 2026 株式会社〇〇' : ''}
          disabled={!overriding}
          onChange={(event) => {
            setCopyright(event.target.value);
          }}
        />
      </div>
      <div className="settings-check">
        <input
          id={overrideId}
          type="checkbox"
          checked={overriding}
          onChange={(event) => {
            setOverride(event.target.checked);
          }}
        />
        <label htmlFor={overrideId}>この文書だけ上書きする</label>
      </div>
      {!overriding && (
        <p className="settings-note">
          テーマの設定値を使用中です。この文書だけ変える場合は「この文書だけ上書きする」をオンにしてください。
        </p>
      )}
    </section>
  );
}
