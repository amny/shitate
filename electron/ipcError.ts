/** Prefix that `ipcRenderer.invoke` adds to errors thrown in the main process. */
const INVOKE_PREFIX = /^Error invoking remote method '[^']*': (?:Error: )?/;

/** Message of an error from `ipcRenderer.invoke`, without the IPC prefix. */
export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(INVOKE_PREFIX, '');
}
