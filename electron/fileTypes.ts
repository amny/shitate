/** Extensions (lower case, without the dot) for the MIME types the app asks for. */
const MIME_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/svg+xml': ['svg'],
  'text/markdown': ['md', 'markdown'],
  'text/html': ['html', 'htm'],
  'application/json': ['json'],
};

/** Lower-case extension of a file name without the dot, or '' when it has none. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Converts an `<input accept>`-style list (".md", "image/png", "image/*")
 * to the extensions for a dialog filter.
 */
export function acceptToExtensions(accept: readonly string[]): string[] {
  const extensions = accept.flatMap((entry): readonly string[] => {
    const value = entry.trim().toLowerCase();
    if (value.startsWith('.') && value.length > 1) {
      return [value.slice(1)];
    }
    if (value.endsWith('/*')) {
      const prefix = value.slice(0, -1);
      return Object.entries(MIME_EXTENSIONS)
        .filter(([mime]) => mime.startsWith(prefix))
        .flatMap(([, exts]) => exts);
    }
    const exts = MIME_EXTENSIONS[value];
    if (!exts) {
      throw new Error(`Unsupported accept entry "${entry}"`);
    }
    return exts;
  });
  return [...new Set(extensions)];
}

/** Image MIME type for a file name, or null when the extension is not a known image type. */
export function imageMimeType(fileName: string): string | null {
  const ext = extensionOf(fileName);
  const found = Object.entries(MIME_EXTENSIONS).find(
    ([mime, exts]) => mime.startsWith('image/') && exts.includes(ext),
  );
  return found ? found[0] : null;
}

/** File name part of a suggested name, so it cannot point to another directory. */
export function safeFileName(suggestedName: string): string {
  const base = suggestedName.split(/[\\/]/).pop()?.trim() ?? '';
  return base === '' || base === '.' || base === '..' ? 'untitled' : base;
}
