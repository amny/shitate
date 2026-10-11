import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function fixture(name: string): Buffer {
  return readFileSync(new URL(`../../fixtures/${name}`, import.meta.url));
}

async function openFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({ name, mimeType: 'application/octet-stream', buffer });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('opens Markdown and shows the file name', async ({ page }) => {
  await openFile(page, 'basic.md', fixture('basic.md'));
  await expect(editorBody(page).locator('h1')).toHaveText('1顧客管理システム 要件定義書');
  await expect(editorBody(page).locator('table th')).toHaveCount(4);
  await expect(editorBody(page).locator('ul ul ul li')).toHaveCount(1);
  await expect(page.getByRole('banner')).toContainText('basic.md');
});

test('opens external HTML keeping merged cells and cell content', async ({ page }) => {
  await openFile(page, 'complex-table.html', fixture('complex-table.html'));
  await expect(editorBody(page).locator('td[rowspan="2"]')).toHaveCount(2);
  await expect(editorBody(page).locator('td[colspan="3"]')).toHaveCount(1);
  await expect(editorBody(page).locator('td > ul, td > ol')).toHaveCount(3);
  await expect(editorBody(page).locator('td table')).toHaveCount(1);
  await expect(editorBody(page).locator('td > [data-node="image"] img')).toHaveCount(2);
});

test('opens TipTap JSON', async ({ page }) => {
  await openFile(page, 'spec-full.json', fixture('spec-full.json'));
  await expect(editorBody(page).locator('h5')).toHaveCount(2);
});

test('opens over existing content without asking, as a new document', async ({ page }) => {
  let dialogShown = false;
  page.on('dialog', (dialog) => {
    dialogShown = true;
    void dialog.dismiss();
  });
  await editorBody(page).click();
  await page.keyboard.type('書きかけの本文');

  await openFile(page, 'basic.md', fixture('basic.md'));
  await expect(editorBody(page).locator('h1')).toHaveCount(1);
  await expect(editorBody(page)).not.toContainText('書きかけの本文');
  expect(dialogShown).toBe(false);

  // The previous document is kept in its own slot, so undo does not bring it back here.
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '保存済みの文書' }).getByRole('listitem'),
  ).toHaveCount(2);
});

test('shows an error for an unsupported file', async ({ page }) => {
  await openFile(page, 'spec.docx', Buffer.from('dummy'));
  await expect(page.getByRole('alert')).toContainText('対応していないファイル形式です');
});

test('removes scripts from external HTML', async ({ page }) => {
  let dialogShown = false;
  page.on('dialog', (dialog) => {
    dialogShown = true;
    void dialog.dismiss();
  });
  await openFile(
    page,
    'evil.html',
    Buffer.from('<p>本文</p><img src="x" onerror="alert(1)"><script>alert(2)</script>'),
  );
  await expect(editorBody(page)).toContainText('本文');
  await expect(editorBody(page).locator('[onerror]')).toHaveCount(0);
  expect(dialogShown).toBe(false);
});

test('warns about external images', async ({ page }) => {
  await openFile(page, 'remote.md', Buffer.from('![図](https://example.com/a.png)'));
  await expect(page.getByRole('alert')).toContainText('外部参照の画像が1件あります');
});
