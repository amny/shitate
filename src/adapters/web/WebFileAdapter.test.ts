import { REVOKE_DELAY_MS, WebFileAdapter } from './WebFileAdapter';

describe('WebFileAdapter', () => {
  const adapter = new WebFileAdapter();

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('saveFile', () => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);

    afterEach(() => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });

    it('downloads the content via a Blob URL and revokes it later', async () => {
      vi.useFakeTimers();
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock');
      const revokeObjectURL = vi.fn<(url: string) => void>();
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      await adapter.saveFile('文書.html', '<p>本文</p>', 'text/html');

      const blob = createObjectURL.mock.calls[0]?.[0];
      expect(blob?.type).toBe('text/html');
      expect(await blob?.text()).toBe('<p>本文</p>');
      expect(click.mock.contexts[0]).toMatchObject({ href: 'blob:mock', download: '文書.html' });
      expect(revokeObjectURL).not.toHaveBeenCalled();

      vi.advanceTimersByTime(REVOKE_DELAY_MS);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
  });

  describe('openFile', () => {
    function captureInput(onClick: (input: HTMLInputElement) => void): void {
      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
        this: HTMLInputElement,
      ) {
        onClick(this);
      });
    }

    it('resolves to the selected file name and text', async () => {
      let accept = '';
      captureInput((input) => {
        accept = input.accept;
        const file = new File(['# 見出し'], 'basic.md', { type: 'text/markdown' });
        Object.defineProperty(input, 'files', { value: [file] });
        input.dispatchEvent(new Event('change'));
      });

      await expect(adapter.openFile(['.md', '.html'])).resolves.toEqual({
        name: 'basic.md',
        text: '# 見出し',
      });
      expect(accept).toBe('.md,.html');
    });

    it('resolves to null when the dialog is cancelled', async () => {
      captureInput((input) => {
        input.dispatchEvent(new Event('cancel'));
      });
      await expect(adapter.openFile(['.md'])).resolves.toBeNull();
    });

    it('rejects with the file name when reading fails', async () => {
      captureInput((input) => {
        const file = new File(['x'], 'broken.html');
        vi.spyOn(file, 'text').mockRejectedValue(new Error('read error'));
        Object.defineProperty(input, 'files', { value: [file] });
        input.dispatchEvent(new Event('change'));
      });
      await expect(adapter.openFile(['.html'])).rejects.toThrow(
        'Failed to read file "broken.html"',
      );
    });
  });

  describe('openImage', () => {
    function selectFile(file: File | null): void {
      vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
        this: HTMLInputElement,
      ) {
        if (file) {
          Object.defineProperty(this, 'files', { value: [file] });
          this.dispatchEvent(new Event('change'));
        } else {
          this.dispatchEvent(new Event('cancel'));
        }
      });
    }

    it('reads the selected image as a data URI', async () => {
      selectFile(new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' }));
      await expect(adapter.openImage(['image/*'])).resolves.toEqual({
        name: 'logo.png',
        dataUri: 'data:image/png;base64,iVBORw==',
      });
    });

    it('resolves to null when the dialog is cancelled', async () => {
      selectFile(null);
      await expect(adapter.openImage(['image/*'])).resolves.toBeNull();
    });

    it('rejects a file that is not an image', async () => {
      selectFile(new File(['text'], 'note.txt', { type: 'text/plain' }));
      await expect(adapter.openImage(['image/*'])).rejects.toThrow(
        'File "note.txt" is not an image (type: "text/plain")',
      );
    });
  });
});
