import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { buildElectron } from './build-electron.ts';

/** Starts the Vite dev server and opens it in Electron (design.md §13.1). */
const root = fileURLToPath(new URL('..', import.meta.url));

// In Node.js, the electron package exports the path to the Electron binary.
const electronPath: unknown = createRequire(import.meta.url)('electron');
if (typeof electronPath !== 'string') {
  throw new Error('The electron package did not export the path to the Electron binary');
}

const server = await createServer({ root });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (url === undefined) {
  await server.close();
  throw new Error('The Vite dev server did not report a local URL');
}

await buildElectron();

const child = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SHITATE_DEV_SERVER_URL: url },
});
child.on('exit', (code) => {
  void server.close().then(() => {
    process.exit(code ?? 0);
  });
});
