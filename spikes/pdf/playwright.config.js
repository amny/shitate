import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'check.spec.js',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5180', ...devices['Desktop Chrome'], viewport: { width: 1400, height: 1000 } },
  webServer: { command: 'pnpm dev', url: 'http://localhost:5180', reuseExistingServer: true },
});
