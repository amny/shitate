export type StoreName = 'drafts' | 'themes' | 'settings';

export const STORE_NAMES: readonly StoreName[] = ['drafts', 'themes', 'settings'];

export interface OpenedFile {
  name: string;
  text: string;
}

export interface OpenedImage {
  name: string;
  /** e.g. "data:image/png;base64,..." */
  dataUri: string;
}

export interface FileAdapter {
  /** Lets the user pick a text file. Resolves to null when the user cancels. */
  openFile(accept: string[]): Promise<OpenedFile | null>;
  /** Lets the user pick an image and reads it as a data URI. Resolves to null when the user cancels. */
  openImage(accept: string[]): Promise<OpenedImage | null>;
  saveFile(suggestedName: string, content: string, mime: string): Promise<void>;
}

/**
 * Key-value persistence.
 * Stored values are not validated: `T` is only the caller's expectation,
 * so callers must validate what they read (e.g. with the zod schemas in src/core/model).
 */
export interface StorageAdapter {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  set(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  list<T>(store: StoreName): Promise<T[]>;
}
