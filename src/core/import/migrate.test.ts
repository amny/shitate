import { createValidEmbeddedData } from '../model/testData';
import { migrate } from './migrate';

describe('migrate', () => {
  it('returns version 1 data as is', () => {
    const data = createValidEmbeddedData();
    expect(migrate(data)).toEqual({ ok: true, data });
  });

  it('rejects data that is not an object', () => {
    const result = migrate('not json object');
    expect(result.ok).toBe(false);
  });

  it('rejects a different format', () => {
    const result = migrate({ ...createValidEmbeddedData(), format: 'other' });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(result.error).toContain('埋め込みデータの形式が不正です');
      expect(result.error).toContain('format');
    }
  });

  it('rejects a newer version with an explicit message', () => {
    const result = migrate({ ...createValidEmbeddedData(), version: 2 });
    expect(result).toEqual({
      ok: false,
      error: '未対応の形式バージョンです（version: 2、対応: 1まで）。アプリを更新してください。',
    });
  });

  it.each([0, 1.5, '1'])('rejects an invalid version value: %o', (version) => {
    expect(migrate({ ...createValidEmbeddedData(), version }).ok).toBe(false);
  });

  it('reports the path and a Japanese message for invalid content', () => {
    const data = createValidEmbeddedData();
    const broken = {
      ...data,
      theme: { ...data.theme, settings: { ...data.theme.settings, tocDepth: 9 } },
    };
    const result = migrate(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('埋め込みデータの内容が不正です');
      expect(result.error).toContain('theme.settings.tocDepth');
      expect(result.error).toMatch(/[ぁ-んァ-ヶ]/);
    }
  });
});
