// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ipcErrorMessage } from './ipcError';

describe('ipcErrorMessage', () => {
  it('removes the prefix added by ipcRenderer.invoke', () => {
    const error = new Error(
      `Error invoking remote method 'shitate:open-file': Error: Failed to read file "a.md"`,
    );
    expect(ipcErrorMessage(error)).toBe('Failed to read file "a.md"');
  });

  it('keeps other messages', () => {
    expect(ipcErrorMessage(new Error('plain'))).toBe('plain');
    expect(ipcErrorMessage('text')).toBe('text');
  });
});
