// @vitest-environment node
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, isUrlInOrigin, resolveAppPath } from './protocol';

const root = path.resolve('/app/dist');

describe('resolveAppPath', () => {
  it('maps app URLs to files in the root', () => {
    expect(resolveAppPath(root, `${APP_ORIGIN}/`)).toBe(path.join(root, 'index.html'));
    expect(resolveAppPath(root, `${APP_ORIGIN}/pdf-preview.html`)).toBe(
      path.join(root, 'pdf-preview.html'),
    );
    expect(resolveAppPath(root, `${APP_ORIGIN}/assets/a%20b.js?v=1#x`)).toBe(
      path.join(root, 'assets', 'a b.js'),
    );
  });

  it('rejects paths outside the root', () => {
    expect(resolveAppPath(root, `${APP_ORIGIN}/..%2F..%2Fetc%2Fpasswd`)).toBeNull();
  });

  it('rejects other origins and malformed escapes', () => {
    expect(resolveAppPath(root, 'app://other/index.html')).toBeNull();
    expect(resolveAppPath(root, 'app://shitate.evil/index.html')).toBeNull();
    expect(resolveAppPath(root, `${APP_ORIGIN}/%E0%A4%A`)).toBeNull();
  });
});

describe('isUrlInOrigin', () => {
  it('matches the origin itself and its paths only', () => {
    expect(isUrlInOrigin(`${APP_ORIGIN}/index.html`, APP_ORIGIN)).toBe(true);
    expect(isUrlInOrigin(APP_ORIGIN, APP_ORIGIN)).toBe(true);
    expect(isUrlInOrigin('app://shitate.evil/', APP_ORIGIN)).toBe(false);
    expect(isUrlInOrigin('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isUrlInOrigin('http://localhost:51730/', 'http://localhost:5173')).toBe(false);
  });
});
