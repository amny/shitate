import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // The PDF preview runs in its own page, shown in an iframe (design.md §10).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        pdfPreview: fileURLToPath(new URL('./pdf-preview.html', import.meta.url)),
      },
    },
  },
  optimizeDeps: {
    // Discovered late otherwise, which re-bundles deps and loads React twice in dev.
    include: ['@tiptap/react/menus'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Theme CSS is imported with ?raw and must keep its content in tests
    // (Vitest empties CSS files by default).
    css: { include: [/\/src\/themes\/.+\.css/] },
  },
});
