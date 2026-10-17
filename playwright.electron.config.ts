import { defineConfig } from '@playwright/test';

// Electron app tests (design.md §13). Run after `pnpm build:electron` (see `pnpm test:e2e:electron`).
export default defineConfig({
  testDir: './tests/electron',
  // Each test launches its own Electron app.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
});
