import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

type TestWindow = Window & { __shitateEditor?: { getHTML: () => string } };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function getHtml(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) {
      throw new Error('window.__shitateEditor is not available (dev build only)');
    }
    return editor.getHTML();
  });
}

async function openFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (await fileChooserPromise).setFiles({ name, mimeType: 'text/plain', buffer });
}

async function exportHtml(page: Page): Promise<{ name: string; html: string }> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  return { name: download.suggestedFilename(), html: readFileSync(path, 'utf8') };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

for (const fixture of ['basic.md', 'complex-table.html', 'spec-full.json']) {
  test(`exported ${fixture} reopens with the same body`, async ({ page }) => {
    await openFile(page, fixture, readFileSync(`fixtures/${fixture}`));
    // Opening is async: wait until the file is loaded before reading the body.
    await expect(page.getByRole('banner')).toContainText(fixture);
    const original = await getHtml(page);

    const exported = await exportHtml(page);
    expect(exported.name).toBe(`${fixture.replace(/\.[^.]+$/, '')}.html`);

    page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await openFile(page, exported.name, Buffer.from(exported.html));
    await expect(page.getByRole('banner')).toContainText(exported.name);
    expect(await getHtml(page)).toBe(original);
  });
}

test('exported HTML works standalone: themed, data hidden', async ({ page, browser }) => {
  await openFile(page, 'basic.md', readFileSync('fixtures/basic.md'));
  await expect(page.getByRole('banner')).toContainText('basic.md');
  const { html } = await exportHtml(page);

  const viewer = await browser.newPage();
  // Block any network access to prove the file is self-contained.
  await viewer.route('**/*', (route) => route.abort());
  await viewer.setContent(html);

  await expect(viewer.locator('.doc .doc-body h1')).toHaveText('1顧客管理システム 要件定義書');
  await expect(viewer.locator('.doc .doc-body h1 .heading-number')).toHaveText('1');
  const h1Border = await viewer
    .locator('.doc-body h1')
    .evaluate((el) => getComputedStyle(el).borderBottomStyle);
  expect(h1Border).toBe('solid');
  const cellBorder = await viewer
    .locator('.doc-body td')
    .first()
    .evaluate((el) => getComputedStyle(el).borderTopStyle);
  expect(cellBorder).toBe('solid');

  await expect(viewer.locator('#doc-data')).toBeHidden();
  const visibleText = await viewer.locator('body').innerText();
  expect(visibleText).not.toContain('tiptap-spec-doc');
  await viewer.close();
});
