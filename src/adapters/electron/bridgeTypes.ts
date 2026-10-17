/**
 * API that electron/preload.ts exposes on `window[DESKTOP_BRIDGE_KEY]` (design.md §13).
 * Shared by the preload and the renderer, so it must not depend on the DOM or Node.js.
 * Results cross the process boundary, so the renderer validates them (`unknown`).
 */
export interface DesktopBridge {
  /** Resolves to `{ name, text }`, or null when the user cancels. */
  openFile(accept: string[]): Promise<unknown>;
  /** Resolves to `{ name, dataUri }`, or null when the user cancels. */
  openImage(accept: string[]): Promise<unknown>;
  /** Writes UTF-8 text to a path chosen in the save dialog. Does nothing when the user cancels. */
  saveFile(suggestedName: string, content: string): Promise<unknown>;
}

export const DESKTOP_BRIDGE_KEY = 'shitateDesktop';
