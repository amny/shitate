import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Builds electron/main.ts and electron/preload.ts to dist-electron/ as CommonJS (design.md §13.1).
 * Built one at a time so the sandboxed preload stays a single file without shared chunks.
 */
export async function buildElectron(): Promise<void> {
  const entries = [
    { name: 'main', entry: 'electron/main.ts' },
    { name: 'preload', entry: 'electron/preload.ts' },
  ] as const;
  for (const { name, entry } of entries) {
    await build({
      root,
      configFile: false,
      publicDir: false,
      logLevel: 'warn',
      build: {
        ssr: entry,
        outDir: 'dist-electron',
        emptyOutDir: name === 'main',
        target: 'node22',
        minify: false,
        sourcemap: true,
        rolldownOptions: {
          output: { format: 'cjs', entryFileNames: `${name}.cjs` },
        },
      },
    });
  }
}

if (import.meta.main) {
  await buildElectron();
}
