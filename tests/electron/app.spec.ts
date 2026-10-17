import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';

const FIXTURE = path.resolve('fixtures/basic.md');

let userDataDir: string;
let outputDir: string;

test.beforeEach(() => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'shitate-user-data-'));
  outputDir = mkdtempSync(path.join(tmpdir(), 'shitate-output-'));
});

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(outputDir, { recursive: true, force: true });
});

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  const app = await electron.launch({
    args: ['.'],
    env: { ...env, SHITATE_USER_DATA_DIR: userDataDir },
  });
  const page = await app.firstWindow();
  await expect(editorBody(page)).toBeVisible();
  return { app, page };
}

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

/** Makes the next open dialog return `filePath` without showing it. */
async function stubOpenDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: [selected] }),
    });
  }, filePath);
}

/** Makes the next save dialog return `filePath` without showing it. */
async function stubSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, selected) => {
    Object.assign(dialog, {
      showSaveDialog: () => Promise.resolve({ canceled: false, filePath: selected }),
    });
  }, filePath);
}

test('loads the build from app:// with the desktop bridge and no Node.js', async () => {
  const { app, page } = await launch();
  try {
    expect(page.url()).toBe('app://shitate/index.html');
    const globals = await page.evaluate(() => ({
      bridge: typeof Reflect.get(window, 'shitateDesktop'),
      require: typeof Reflect.get(window, 'require'),
      process: typeof Reflect.get(window, 'process'),
    }));
    expect(globals).toEqual({ bridge: 'object', require: 'undefined', process: 'undefined' });
  } finally {
    await app.close();
  }
});

test('opens, exports and autosaves through the main process', async () => {
  let { app, page } = await launch();
  try {
    await stubOpenDialog(app, FIXTURE);
    await page.getByRole('button', { name: '開く' }).click();
    await expect(editorBody(page)).toContainText('顧客管理システム 要件定義書');
    await expect(page.getByRole('status')).toContainText('自動保存済み');

    const exported = path.join(outputDir, 'exported.html');
    await stubSaveDialog(app, exported);
    await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
    await expect.poll(() => readFileSync(exported, 'utf8')).toContain('id="doc-data"');

    // The autosaved document is offered after a restart (same profile).
    await app.close();
    ({ app, page } = await launch());
    const banner = page.getByRole('region', { name: '前回の編集内容' });
    await expect(banner).toContainText('basic.md');
    await banner.getByRole('button', { name: '開く' }).click();
    await expect(editorBody(page)).toContainText('顧客管理システム 要件定義書');

    // The exported HTML opens again.
    await stubOpenDialog(app, exported);
    await page.getByRole('button', { name: '新規' }).click();
    await page.getByRole('button', { name: '開く' }).click();
    await expect(editorBody(page)).toContainText('顧客管理システム 要件定義書');
  } finally {
    await app.close();
  }
});

test('rejects files that do not match the dialog filter', async () => {
  const { app, page } = await launch();
  try {
    await stubOpenDialog(app, path.resolve('package.json.lock'));
    await page.getByRole('button', { name: '開く' }).click();
    await expect(page.getByRole('alert')).toContainText('is not an accepted type');
  } finally {
    await app.close();
  }
});

test('lays out the PDF preview in its iframe', async () => {
  const { app, page } = await launch();
  try {
    await stubOpenDialog(app, FIXTURE);
    await page.getByRole('button', { name: '開く' }).click();
    await expect(editorBody(page)).toContainText('顧客管理システム 要件定義書');
    await page.getByRole('button', { name: 'PDFプレビュー' }).click();
    const pages = page
      .frameLocator('iframe[title="PDFのページ"]')
      .locator('[data-vivliostyle-page-container]');
    await expect(pages.first()).toBeVisible({ timeout: 30_000 });
  } finally {
    await app.close();
  }
});
