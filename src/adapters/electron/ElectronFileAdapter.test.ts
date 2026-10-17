import type { FileAdapter } from '../types';
import { ElectronFileAdapter, getDesktopBridge } from './ElectronFileAdapter';
import type { DesktopBridge } from './bridgeTypes';

function bridgeReturning(results: Partial<Record<keyof DesktopBridge, unknown>>) {
  const openFile = vi.fn<DesktopBridge['openFile']>(() =>
    Promise.resolve(results.openFile ?? null),
  );
  const openImage = vi.fn<DesktopBridge['openImage']>(() =>
    Promise.resolve(results.openImage ?? null),
  );
  const saveFile = vi.fn<DesktopBridge['saveFile']>(() => Promise.resolve(undefined));
  const bridge: DesktopBridge = { openFile, openImage, saveFile };
  return Object.assign(bridge, { mocks: { openFile, openImage, saveFile } });
}

describe('ElectronFileAdapter', () => {
  it('returns opened files and null on cancel', async () => {
    const bridge = bridgeReturning({ openFile: { name: 'a.md', text: '# A' } });
    const adapter = new ElectronFileAdapter(bridge);
    await expect(adapter.openFile(['.md'])).resolves.toEqual({ name: 'a.md', text: '# A' });
    expect(bridge.mocks.openFile).toHaveBeenCalledWith(['.md']);
    await expect(
      new ElectronFileAdapter(bridgeReturning({})).openFile(['.md']),
    ).resolves.toBeNull();
  });

  it('returns opened images', async () => {
    const image = { name: 'a.png', dataUri: 'data:image/png;base64,AAAA' };
    const adapter = new ElectronFileAdapter(bridgeReturning({ openImage: image }));
    await expect(adapter.openImage(['image/png'])).resolves.toEqual(image);
  });

  it('rejects malformed results from the bridge', async () => {
    await expect(
      new ElectronFileAdapter(bridgeReturning({ openFile: { name: 'a.md' } })).openFile(['.md']),
    ).rejects.toThrow('Unexpected result from the desktop app (openFile)');
    await expect(
      new ElectronFileAdapter(
        bridgeReturning({ openImage: { name: 'a.png', dataUri: 'javascript:alert(1)' } }),
      ).openImage(['image/png']),
    ).rejects.toThrow('(openImage)');
  });

  it('saves through the bridge', async () => {
    const bridge = bridgeReturning({});
    const adapter: FileAdapter = new ElectronFileAdapter(bridge);
    await adapter.saveFile('doc.html', '<html></html>', 'text/html');
    expect(bridge.mocks.saveFile).toHaveBeenCalledWith('doc.html', '<html></html>');
  });
});

describe('getDesktopBridge', () => {
  it('is undefined in a browser', () => {
    expect(getDesktopBridge()).toBeUndefined();
    expect(getDesktopBridge({ shitateDesktop: { openFile: () => null } })).toBeUndefined();
  });

  it('returns the bridge exposed by the preload', () => {
    const bridge = bridgeReturning({});
    expect(getDesktopBridge({ shitateDesktop: bridge })).toBe(bridge);
  });
});
