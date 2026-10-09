import type { FileAdapter, OpenedFile, OpenedImage } from '../types';

/** Delay before releasing the Blob URL, so the browser has started the download. */
export const REVOKE_DELAY_MS = 10_000;

/** FileAdapter for browsers: <input type="file"> to open, Blob + download link to save. */
export class WebFileAdapter implements FileAdapter {
  async openFile(accept: string[]): Promise<OpenedFile | null> {
    const file = await pickFile(accept);
    if (!file) {
      return null;
    }
    try {
      return { name: file.name, text: await file.text() };
    } catch (error: unknown) {
      throw new Error(`Failed to read file "${file.name}"`, { cause: error });
    }
  }

  async openImage(accept: string[]): Promise<OpenedImage | null> {
    const file = await pickFile(accept);
    if (!file) {
      return null;
    }
    if (!file.type.startsWith('image/')) {
      throw new Error(`File "${file.name}" is not an image (type: "${file.type}")`);
    }
    try {
      return { name: file.name, dataUri: await readAsDataUri(file) };
    } catch (error: unknown) {
      throw new Error(`Failed to read image "${file.name}"`, { cause: error });
    }
  }

  saveFile(suggestedName: string, content: string, mime: string): Promise<void> {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = suggestedName;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
    return Promise.resolve();
  }
}

/** Shows the file dialog. Resolves to null when the user cancels. */
function pickFile(accept: string[]): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept.join(',');
    input.addEventListener(
      'change',
      () => {
        resolve(input.files?.[0] ?? null);
      },
      { once: true },
    );
    // Fired by Chrome / Edge 113+ when the dialog is closed without a selection.
    input.addEventListener(
      'cancel',
      () => {
        resolve(null);
      },
      { once: true },
    );
    input.click();
  });
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    });
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('FileReader failed'));
    });
    reader.readAsDataURL(file);
  });
}
