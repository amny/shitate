// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { acceptToExtensions, extensionOf, imageMimeType, safeFileName } from './fileTypes';

describe('acceptToExtensions', () => {
  it('converts extensions and MIME types', () => {
    expect(acceptToExtensions(['.md', '.HTML', 'application/json'])).toEqual([
      'md',
      'html',
      'json',
    ]);
    expect(acceptToExtensions(['image/png', 'image/jpeg', 'image/svg+xml'])).toEqual([
      'png',
      'jpg',
      'jpeg',
      'svg',
    ]);
  });

  it('expands wildcards and removes duplicates', () => {
    expect(acceptToExtensions(['image/*', '.png'])).toEqual([
      'png',
      'jpg',
      'jpeg',
      'gif',
      'webp',
      'svg',
    ]);
  });

  it('rejects unknown MIME types', () => {
    expect(() => acceptToExtensions(['application/pdf'])).toThrow('application/pdf');
  });
});

describe('extensionOf', () => {
  it('returns the lower-case extension without the dot', () => {
    expect(extensionOf('/a/b/Spec.Final.HTML')).toBe('html');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
  });
});

describe('imageMimeType', () => {
  it('detects image types from the extension', () => {
    expect(imageMimeType('logo.PNG')).toBe('image/png');
    expect(imageMimeType('photo.jpeg')).toBe('image/jpeg');
    expect(imageMimeType('icon.svg')).toBe('image/svg+xml');
    expect(imageMimeType('doc.html')).toBeNull();
    expect(imageMimeType('noext')).toBeNull();
  });
});

describe('safeFileName', () => {
  it('keeps only the file name part', () => {
    expect(safeFileName('要件定義書.html')).toBe('要件定義書.html');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\a\\b.json')).toBe('b.json');
    expect(safeFileName('..')).toBe('untitled');
    expect(safeFileName('dir/')).toBe('untitled');
  });
});
