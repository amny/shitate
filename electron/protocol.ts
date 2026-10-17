import path from 'node:path';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://shitate`;

/** Whether a URL belongs to the given origin (compared as text: Node.js gives custom schemes a "null" origin). */
export function isUrlInOrigin(url: string, origin: string): boolean {
  return url === origin || url.startsWith(`${origin}/`);
}

/**
 * File in `rootDir` for an `app://shitate/...` request, or null when the URL is
 * not on the app origin or points outside `rootDir`.
 */
export function resolveAppPath(rootDir: string, requestUrl: string): string | null {
  if (!isUrlInOrigin(requestUrl, APP_ORIGIN)) {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  const relative =
    pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}
