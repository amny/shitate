import { ElectronFileAdapter, getDesktopBridge } from './electron/ElectronFileAdapter';
import type { FileAdapter, StorageAdapter } from './types';
import { IdbStorageAdapter } from './web/IdbStorageAdapter';
import { WebFileAdapter } from './web/WebFileAdapter';

export type { FileAdapter, OpenedFile, OpenedImage, StorageAdapter, StoreName } from './types';

// Platform implementations are chosen here only. The same build runs in browsers and
// in Electron, so the file adapter is chosen at run time (design.md §9.1, §13).
let fileAdapter: FileAdapter | null = null;
let storageAdapter: StorageAdapter | null = null;

function createFileAdapter(): FileAdapter {
  const bridge = getDesktopBridge();
  return bridge ? new ElectronFileAdapter(bridge) : new WebFileAdapter();
}

export function getFileAdapter(): FileAdapter {
  fileAdapter ??= createFileAdapter();
  return fileAdapter;
}

export function getStorageAdapter(): StorageAdapter {
  storageAdapter ??= new IdbStorageAdapter();
  return storageAdapter;
}
