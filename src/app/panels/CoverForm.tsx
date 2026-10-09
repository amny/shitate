import { useId } from 'react';
import type { DocMeta } from '../../core/model';
import { useDocumentStore } from '../store/documentStore';

type TextField = Exclude<keyof DocMeta, 'date'>;

const TEXT_FIELDS: readonly { key: TextField; label: string; placeholder: string }[] = [
  { key: 'title', label: 'タイトル', placeholder: '基本設計書' },
  { key: 'projectName', label: '案件名', placeholder: '顧客管理システム構築' },
  { key: 'version', label: '版数', placeholder: '1.0' },
  { key: 'companyName', label: '会社名', placeholder: '株式会社〇〇' },
  { key: 'clientName', label: '顧客名（任意）', placeholder: '〇〇株式会社' },
];

/** Cover information (design: 文書設定 > 表紙). Shown on the cover of the export. */
export function CoverForm() {
  const meta = useDocumentStore((state) => state.meta);
  const updateMeta = useDocumentStore((state) => state.updateMeta);
  const baseId = useId();
  const [beforeDate, afterDate] = [TEXT_FIELDS.slice(0, 3), TEXT_FIELDS.slice(3)];

  const textField = ({ key, label, placeholder }: (typeof TEXT_FIELDS)[number]) => (
    <div key={key} className="settings-field">
      <label htmlFor={`${baseId}-${key}`}>{label}</label>
      <input
        id={`${baseId}-${key}`}
        type="text"
        className="settings-input"
        value={meta[key] ?? ''}
        placeholder={placeholder}
        onChange={(event) => {
          updateMeta({ [key]: event.target.value });
        }}
      />
    </div>
  );

  return (
    <section className="settings-section" aria-label="表紙">
      {beforeDate.map(textField)}
      <div className="settings-field">
        <label htmlFor={`${baseId}-date`}>日付</label>
        <input
          id={`${baseId}-date`}
          type="date"
          className="settings-input"
          value={meta.date}
          required
          onChange={(event) => {
            // The date is required: clearing the field keeps the previous date.
            if (event.target.value !== '') {
              updateMeta({ date: event.target.value });
            }
          }}
        />
      </div>
      {afterDate.map(textField)}
      <p className="settings-note">
        タイトル・案件名・会社名・顧客名のどれかを入力すると、表紙が出力されます。
      </p>
    </section>
  );
}
