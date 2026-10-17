import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_BRIDGE_KEY } from '../src/adapters/electron/bridgeTypes';
import type { DesktopBridge } from '../src/adapters/electron/bridgeTypes';
import { IPC_CHANNELS } from './channels';
import { ipcErrorMessage } from './ipcError';

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args);
    return result;
  } catch (error: unknown) {
    throw new Error(ipcErrorMessage(error), { cause: error });
  }
}

const bridge: DesktopBridge = {
  openFile: (accept) => invoke(IPC_CHANNELS.openFile, accept),
  openImage: (accept) => invoke(IPC_CHANNELS.openImage, accept),
  saveFile: (suggestedName, content) => invoke(IPC_CHANNELS.saveFile, suggestedName, content),
};

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_KEY, bridge);
