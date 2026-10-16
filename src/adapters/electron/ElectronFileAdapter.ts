import { z } from 'zod';
import type { FileAdapter, OpenedFile, OpenedImage } from '../types';
import { DESKTOP_BRIDGE_KEY } from './bridgeTypes';
import type { DesktopBridge } from './bridgeTypes';

const openedFileSchema = z.object({ name: z.string(), text: z.string() }).nullable();
const openedImageSchema = z
  .object({ name: z.string(), dataUri: z.string().startsWith('data:image/') })
  .nullable();

function parseResult<T>(schema: z.ZodType<T>, value: unknown, operation: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Unexpected result from the desktop app (${operation})`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** FileAdapter for the Electron app: dialogs and file access in the main process (design.md §13.3). */
export class ElectronFileAdapter implements FileAdapter {
  readonly #bridge: DesktopBridge;

  constructor(bridge: DesktopBridge) {
    this.#bridge = bridge;
  }

  async openFile(accept: string[]): Promise<OpenedFile | null> {
    return parseResult(openedFileSchema, await this.#bridge.openFile(accept), 'openFile');
  }

  async openImage(accept: string[]): Promise<OpenedImage | null> {
    return parseResult(openedImageSchema, await this.#bridge.openImage(accept), 'openImage');
  }

  /** `mime` is not needed: the file is written as UTF-8 text to the chosen path. */
  async saveFile(suggestedName: string, content: string): Promise<void> {
    await this.#bridge.saveFile(suggestedName, content);
  }
}

function isDesktopBridge(value: unknown): value is DesktopBridge {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return (['openFile', 'openImage', 'saveFile'] as const).every(
    (key) => typeof Reflect.get(value, key) === 'function',
  );
}

/** The bridge exposed by electron/preload.ts, or undefined in a browser. */
export function getDesktopBridge(target: object = window): DesktopBridge | undefined {
  const value: unknown = Reflect.get(target, DESKTOP_BRIDGE_KEY);
  return isDesktopBridge(value) ? value : undefined;
}
