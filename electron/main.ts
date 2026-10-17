import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, dialog, ipcMain, net, protocol, session, shell } from 'electron';
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from 'electron';
import { IPC_CHANNELS } from './channels';
import { acceptToExtensions, extensionOf, imageMimeType, safeFileName } from './fileTypes';
import { APP_ORIGIN, APP_SCHEME, isUrlInOrigin, resolveAppPath } from './protocol';

/** Set by scripts/dev-electron.ts to load the Vite dev server instead of the build. */
const devServerUrl = process.env['SHITATE_DEV_SERVER_URL'];
const appOrigin = devServerUrl ? new URL(devServerUrl).origin : APP_ORIGIN;

// Lets tests and development use a separate profile (IndexedDB) from the installed app.
const userDataDir = process.env['SHITATE_USER_DATA_DIR'];
if (userDataDir) {
  app.setPath('userData', userDataDir);
}

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** Directory of the last file opened or saved, used as the next dialog's start. */
let lastDirectory: string | null = null;

function dialogDirectory(): string {
  return lastDirectory ?? app.getPath('documents');
}

function rememberDirectory(filePath: string): void {
  lastDirectory = path.dirname(filePath);
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url ?? '';
  if (!isUrlInOrigin(url, appOrigin)) {
    throw new Error(`IPC from an untrusted frame was rejected (${url})`);
  }
}

function parseStringArray(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`"${name}" must be an array of strings`);
  }
  return value;
}

function parseString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`"${name}" must be a string`);
  }
  return value;
}

/** Shows the open dialog limited to `extensions`. Resolves to null when the user cancels. */
async function pickFile(event: IpcMainInvokeEvent, extensions: string[]): Promise<string | null> {
  const options: OpenDialogOptions = {
    defaultPath: dialogDirectory(),
    properties: ['openFile'],
    filters: [{ name: '対応ファイル', extensions }],
  };
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || filePath === undefined) {
    return null;
  }
  // The dialog filter can be bypassed (e.g. "All Files" on some platforms).
  if (!extensions.includes(extensionOf(filePath))) {
    throw new Error(
      `File "${path.basename(filePath)}" is not an accepted type (.${extensions.join(' / .')})`,
    );
  }
  rememberDirectory(filePath);
  return filePath;
}

async function openFile(
  event: IpcMainInvokeEvent,
  accept: unknown,
): Promise<{ name: string; text: string } | null> {
  assertTrustedSender(event);
  const filePath = await pickFile(event, acceptToExtensions(parseStringArray(accept, 'accept')));
  if (filePath === null) {
    return null;
  }
  const name = path.basename(filePath);
  try {
    return { name, text: await readFile(filePath, 'utf8') };
  } catch (error: unknown) {
    throw new Error(`Failed to read file "${name}"`, { cause: error });
  }
}

async function openImage(
  event: IpcMainInvokeEvent,
  accept: unknown,
): Promise<{ name: string; dataUri: string } | null> {
  assertTrustedSender(event);
  const filePath = await pickFile(event, acceptToExtensions(parseStringArray(accept, 'accept')));
  if (filePath === null) {
    return null;
  }
  const name = path.basename(filePath);
  const mime = imageMimeType(name);
  if (mime === null) {
    throw new Error(`File "${name}" is not an image`);
  }
  try {
    const data = await readFile(filePath);
    return { name, dataUri: `data:${mime};base64,${data.toString('base64')}` };
  } catch (error: unknown) {
    throw new Error(`Failed to read image "${name}"`, { cause: error });
  }
}

async function saveFile(
  event: IpcMainInvokeEvent,
  suggestedName: unknown,
  content: unknown,
): Promise<void> {
  assertTrustedSender(event);
  const name = safeFileName(parseString(suggestedName, 'suggestedName'));
  const text = parseString(content, 'content');
  const ext = extensionOf(name);
  const options: SaveDialogOptions = {
    defaultPath: path.join(dialogDirectory(), name),
    filters: ext === '' ? [] : [{ name: ext.toUpperCase(), extensions: [ext] }],
  };
  const window = BrowserWindow.fromWebContents(event.sender);
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return;
  }
  try {
    await writeFile(result.filePath, text, 'utf8');
  } catch (error: unknown) {
    throw new Error(`Failed to save file "${path.basename(result.filePath)}"`, { cause: error });
  }
  rememberDirectory(result.filePath);
}

function openExternalIfWeb(url: string): void {
  if (/^https?:\/\//i.test(url)) {
    shell.openExternal(url).catch((error: unknown) => {
      console.error(`Failed to open external URL "${url}"`, error);
    });
  }
}

function serveRenderer(rendererDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAppPath(rendererDir, request.url);
    if (filePath === null) {
      return new Response('Not found', { status: 404 });
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (error: unknown) {
      console.error(`Failed to serve "${request.url}"`, error);
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfWeb(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    if (!isUrlInOrigin(event.url, appOrigin)) {
      event.preventDefault();
      openExternalIfWeb(event.url);
    }
  });
  window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`).catch((error: unknown) => {
    console.error('Failed to load the app', error);
  });
}

app
  .whenReady()
  .then(() => {
    serveRenderer(path.join(app.getAppPath(), 'dist'));
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    ipcMain.handle(IPC_CHANNELS.openFile, openFile);
    ipcMain.handle(IPC_CHANNELS.openImage, openImage);
    ipcMain.handle(IPC_CHANNELS.saveFile, saveFile);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error: unknown) => {
    console.error('Failed to start the app', error);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
