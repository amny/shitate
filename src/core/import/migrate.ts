import { z } from 'zod';
import { EMBEDDED_DATA_FORMAT, EMBEDDED_DATA_VERSION, embeddedDataSchema } from '../model';
import type { EmbeddedData } from '../model';

export type MigrateResult = { ok: true; data: EmbeddedData } | { ok: false; error: string };

const japaneseErrorMap = z.locales.ja().localeError;

const headerSchema = z.looseObject({
  format: z.literal(EMBEDDED_DATA_FORMAT),
  version: z.number().int().positive(),
});

/**
 * Validates embedded data read from an exported HTML file and upgrades it to the
 * current EmbeddedData version. Add a step here whenever EmbeddedData.version is bumped.
 */
export function migrate(data: unknown): MigrateResult {
  const header = headerSchema.safeParse(data, { error: japaneseErrorMap });
  if (!header.success) {
    return { ok: false, error: formatError('埋め込みデータの形式が不正です', header.error) };
  }

  const { version } = header.data;
  if (version > EMBEDDED_DATA_VERSION) {
    return {
      ok: false,
      error: `未対応の形式バージョンです（version: ${String(version)}、対応: ${String(EMBEDDED_DATA_VERSION)}まで）。アプリを更新してください。`,
    };
  }

  // Only version 1 exists so far; future versions upgrade `data` step by step here.
  const parsed = embeddedDataSchema.safeParse(data, { error: japaneseErrorMap });
  if (!parsed.success) {
    return { ok: false, error: formatError('埋め込みデータの内容が不正です', parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

function formatError(summary: string, error: z.ZodError): string {
  const details = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '(ルート)';
    return `- ${path}: ${issue.message}`;
  });
  return [summary, ...details].join('\n');
}
