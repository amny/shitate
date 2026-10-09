const INVALID_FILE_NAME_CHARS = '\\/:*?"<>|';
const FALLBACK_NAME = '文書';

function isInvalidFileNameChar(char: string): boolean {
  return INVALID_FILE_NAME_CHARS.includes(char) || char.charCodeAt(0) < 0x20;
}

/**
 * File name for the exported HTML: the opened file's name (without extension),
 * else the document title, else "文書". Characters invalid on Windows / macOS become "_".
 */
export function toExportFileName(sourceFileName: string | null, title: string): string {
  const fromSource = sourceFileName?.replace(/\.[^.]+$/, '').trim() ?? '';
  const base = fromSource || title.trim() || FALLBACK_NAME;
  const safe = Array.from(base, (char) => (isInvalidFileNameChar(char) ? '_' : char)).join('');
  return `${safe}.html`;
}
