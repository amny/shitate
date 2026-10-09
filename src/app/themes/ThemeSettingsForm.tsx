import { useId } from 'react';
import { getFileAdapter } from '../../adapters';
import { tocDepthSchema } from '../../core/model';
import type { ThemeSettings } from '../../core/model';
import { PageSettingsFields } from '../panels/PageSettingsFields';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const DEPTHS = [1, 2, 3, 4, 5] as const;

interface ThemeSettingsFormProps {
  value: ThemeSettings;
  onChange: (settings: ThemeSettings) => void;
  onError: (message: string) => void;
}

/**
 * The theme's own setting values (テーマ編集 > 設定値, design.md §8.4). Documents use them
 * unless they override them in the document settings panel.
 */
export function ThemeSettingsForm({ value, onChange, onError }: ThemeSettingsFormProps) {
  const id = useId();
  const update = (patch: Partial<ThemeSettings>) => {
    onChange({ ...value, ...patch });
  };

  const chooseLogo = async () => {
    try {
      const image = await getFileAdapter().openImage(LOGO_TYPES);
      if (image) update({ logoDataUri: image.dataUri });
    } catch (error: unknown) {
      console.error('Failed to read the logo image', error);
      onError(
        `ロゴ画像を読み込めませんでした。${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const removeLogo = () => {
    const { logoDataUri: _removed, ...rest } = value;
    onChange(rest);
  };

  return (
    <div className="theme-settings-form">
      <section className="settings-section" aria-labelledby={`${id}-header`}>
        <h3 id={`${id}-header`} className="settings-heading">
          ヘッダー・フッター
        </h3>
        <div className="settings-field">
          <span id={`${id}-logo`}>ロゴ画像</span>
          <div className="logo-setting" role="group" aria-labelledby={`${id}-logo`}>
            {value.logoDataUri && (
              <img className="logo-setting-image" src={value.logoDataUri} alt="ロゴ画像" />
            )}
            <div className="logo-setting-actions">
              <button
                type="button"
                className="settings-button"
                onClick={() => {
                  void chooseLogo();
                }}
              >
                {value.logoDataUri ? '変更' : '画像を選択（PNG / JPEG / SVG）'}
              </button>
              {value.logoDataUri && (
                <button type="button" className="settings-button" onClick={removeLogo}>
                  削除
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="settings-field">
          <label htmlFor={`${id}-copyright`}>Copyright</label>
          <input
            id={`${id}-copyright`}
            type="text"
            className="settings-input"
            value={value.copyright ?? ''}
            placeholder="© 2026 株式会社〇〇"
            onChange={(event) => {
              update({ copyright: event.target.value });
            }}
          />
        </div>
      </section>
      <section className="settings-section" aria-labelledby={`${id}-toc`}>
        <h3 id={`${id}-toc`} className="settings-heading">
          目次
        </h3>
        <div className="settings-row">
          <label htmlFor={`${id}-depth`}>目次に載せる深さ</label>
          <select
            id={`${id}-depth`}
            className="settings-select"
            value={value.tocDepth}
            onChange={(event) => {
              const parsed = tocDepthSchema.safeParse(Number(event.target.value));
              if (parsed.success) update({ tocDepth: parsed.data });
            }}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d}階層
              </option>
            ))}
          </select>
        </div>
      </section>
      <section className="settings-section" aria-labelledby={`${id}-page`}>
        <h3 id={`${id}-page`} className="settings-heading">
          ページ（PDF）
        </h3>
        <PageSettingsFields
          value={value.page}
          onChange={(page) => {
            update({ page });
          }}
        />
      </section>
      <p className="settings-note">
        ここで設定した値は、このテーマを使う文書の既定値です。文書ごとの変更は、編集画面の「文書設定」で行います。
      </p>
    </div>
  );
}
