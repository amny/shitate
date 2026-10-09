import type { FileAdapter, StorageAdapter } from './types';
import { IdbStorageAdapter } from './web/IdbStorageAdapter';
import { WebFileAdapter } from './web/WebFileAdapter';

export type { FileAdapter, OpenedFile, OpenedImage, StorageAdapter, StoreName } from './types';

// Platform implementations are chosen here only (swap for Electron in task 4-1).
let fileAdapter: FileAdapter | null = null;
let storageAdapter: StorageAdapter | null = null;

export function getFileAdapter(): FileAdapter {
  fileAdapter ??= new WebFileAdapter();
  return fileAdapter;
}

export function getStorageAdapter(): StorageAdapter {
  storageAdapter ??= new IdbStorageAdapter();
  return storageAdapter;
}
