import { useId, useState } from 'react';
import {
  BASE_FONT_PT_MAX,
  BASE_FONT_PT_MIN,
  CUSTOM_PAGE_MM_MAX,
  CUSTOM_PAGE_MM_MIN,
  pageMarginSchema,
  pageOrientationSchema,
  pageSizeSchema,
} from '../../core/model';
import type { PageSettings } from '../../core/model';

const SIZE_OPTIONS: readonly { value: PageSettings['size']; label: string }[] = [
  { value: 'A4', label: 'A4（210×297mm）' },
  { value: 'A3', label: 'A3（297×420mm）' },
  { value: 'B4', label: 'B4（JIS 257×364mm）' },
  { value: 'custom', label: 'カスタム' },
];

const MARGIN_OPTIONS: readonly { value: PageSettings['margin']; label: string }[] = [
  { value: 'narrow', label: '狭い（12mm）' },
  { value: 'normal', label: '標準（20×18mm）' },
  { value: 'wide', label: '広い（25mm）' },
];

const FONT_SIZES: readonly number[] = Array.from(
  { length: (BASE_FONT_PT_MAX - BASE_FONT_PT_MIN) * 2 + 1 },
  (_, i) => BASE_FONT_PT_MIN + i * 0.5,
);

const DEFAULT_CUSTOM_MM = { width: 210, height: 297 };

/** A custom length in mm, or an error message (design.md §10.1: 100–1000mm). */
function parseMm(text: string): number | string {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return '数値で入力してください';
  if (value < CUSTOM_PAGE_MM_MIN || value > CUSTOM_PAGE_MM_MAX) {
    return `${String(CUSTOM_PAGE_MM_MIN)}〜${String(CUSTOM_PAGE_MM_MAX)}mmで入力してください`;
  }
  return value;
}

interface PageSettingsFieldsProps {
  value: PageSettings;
  onChange: (page: PageSettings) => void;
}

/**
 * Page size, orientation, margin and base font size (design.md §10.1). Used for the document's
 * override (文書設定) and for the theme's own settings (テーマ編集).
 */
export function PageSettingsFields({ value: page, onChange }: PageSettingsFieldsProps) {
  const id = useId();
  const update = (patch: Partial<PageSettings>) => {
    onChange({ ...page, ...patch });
  };

  return (
    <>
      <div className="settings-row">
        <label htmlFor={`${id}-size`}>サイズ</label>
        <select
          id={`${id}-size`}
          className="settings-select"
          value={page.size}
          onChange={(event) => {
            const size = pageSizeSchema.parse(event.target.value);
            update(
              size === 'custom' ? { size, customMm: page.customMm ?? DEFAULT_CUSTOM_MM } : { size },
            );
          }}
        >
          {SIZE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {page.size === 'custom' && (
        // Keyed so the inputs restart from the saved values after "テーマの設定に戻す".
        <CustomSizeFields
          key={JSON.stringify(page.customMm)}
          customMm={page.customMm ?? DEFAULT_CUSTOM_MM}
          onChange={(customMm) => {
            update({ customMm });
          }}
        />
      )}
      <div className="settings-row">
        <span id={`${id}-orientation`}>向き</span>
        <div className="settings-segmented" role="radiogroup" aria-labelledby={`${id}-orientation`}>
          {(['portrait', 'landscape'] as const).map((orientation) => (
            <label key={orientation} className="settings-segment">
              <input
                type="radio"
                name={`${id}-orientation`}
                checked={page.orientation === orientation}
                onChange={() => {
                  update({ orientation: pageOrientationSchema.parse(orientation) });
                }}
              />
              <span>{orientation === 'portrait' ? '縦' : '横'}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <label htmlFor={`${id}-margin`}>余白</label>
        <select
          id={`${id}-margin`}
          className="settings-select"
          value={page.margin}
          onChange={(event) => {
            update({ margin: pageMarginSchema.parse(event.target.value) });
          }}
        >
          {MARGIN_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <label htmlFor={`${id}-font`}>基準文字サイズ</label>
        <select
          id={`${id}-font`}
          className="settings-select"
          value={String(page.baseFontPt)}
          onChange={(event) => {
            update({ baseFontPt: Number(event.target.value) });
          }}
        >
          {FONT_SIZES.map((pt) => (
            <option key={pt} value={String(pt)}>
              {pt}pt
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

interface CustomSizeFieldsProps {
  customMm: { width: number; height: number };
  onChange: (customMm: { width: number; height: number }) => void;
}

/** Width / height in mm; only valid values are saved, invalid input shows an error. */
function CustomSizeFields({ customMm, onChange }: CustomSizeFieldsProps) {
  const id = useId();
  const [text, setText] = useState({
    width: String(customMm.width),
    height: String(customMm.height),
  });
  const fields = [
    { key: 'width', label: '幅（mm）' },
    { key: 'height', label: '高さ（mm）' },
  ] as const;

  return (
    <div className="page-custom-size">
      {fields.map(({ key, label }) => {
        const parsed = parseMm(text[key]);
        const error = typeof parsed === 'string' ? parsed : null;
        return (
          <div key={key} className="settings-field">
            <label htmlFor={`${id}-${key}`}>{label}</label>
            <input
              id={`${id}-${key}`}
              type="number"
              inputMode="decimal"
              min={CUSTOM_PAGE_MM_MIN}
              max={CUSTOM_PAGE_MM_MAX}
              className="settings-input"
              value={text[key]}
              aria-invalid={error !== null}
              aria-describedby={error ? `${id}-${key}-error` : undefined}
              onChange={(event) => {
                const next = { ...text, [key]: event.target.value };
                setText(next);
                const width = parseMm(next.width);
                const height = parseMm(next.height);
                if (typeof width === 'number' && typeof height === 'number') {
                  onChange({ width, height });
                }
              }}
            />
            {error && (
              <span id={`${id}-${key}-error`} className="settings-error" role="alert">
                {error}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
