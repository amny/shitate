/** IPC channels between electron/preload.ts and electron/main.ts (design.md §13.3). */
export const IPC_CHANNELS = {
  openFile: 'shitate:open-file',
  openImage: 'shitate:open-image',
  saveFile: 'shitate:save-file',
} as const;
