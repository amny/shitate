import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function restoreBanner(page: Page): Locator {
  return page.getByRole('region', { name: '前回の編集内容' });
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByRole('status')).toContainText('自動保存済み');
}

async function openFixture(page: Page, name: string): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await fileChooserPromise
  ).setFiles({
    name,
    mimeType: 'text/plain',
    buffer: readFileSync(`fixtures/${name}`),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('restores the previous edit after a reload', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('自動保存のテスト');
  await waitForSaved(page);

  await page.reload();
  await expect(restoreBanner(page)).toContainText('前回の編集内容を復元しますか？');
  await expect(editorBody(page)).not.toContainText('自動保存のテスト');

  await restoreBanner(page).getByRole('button', { name: '復元する' }).click();
  await expect(editorBody(page)).toContainText('自動保存のテスト');
  await expect(restoreBanner(page)).toBeHidden();
});

test('restores an opened file together with its file name', async ({ page }) => {
  await openFixture(page, 'complex-table.html');
  await waitForSaved(page);
  const before = await editorBody(page).innerHTML();

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '復元する' }).click();
  await expect(page.getByRole('banner')).toContainText('complex-table.html');
  await expect(editorBody(page).locator('td[rowspan="2"]')).toHaveCount(2);
  expect(await editorBody(page).innerHTML()).toBe(before);
});

test('does not overwrite the draft before the user answers', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('残すべき内容');
  await waitForSaved(page);

  await page.reload();
  await expect(restoreBanner(page)).toBeVisible();
  // Longer than the autosave delay: the empty startup document must not be saved.
  await page.waitForTimeout(1500);
  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '復元する' }).click();
  await expect(editorBody(page)).toContainText('残すべき内容');
});

test('discarding starts empty and removes the draft', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('破棄する内容');
  await waitForSaved(page);

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '破棄する' }).click();
  await expect(restoreBanner(page)).toBeHidden();
  await expect(editorBody(page)).not.toContainText('破棄する内容');

  await page.reload();
  await expect(editorBody(page)).toBeVisible();
  await page.waitForTimeout(500);
  await expect(restoreBanner(page)).toBeHidden();
});

test('saves and restores a document with a large image (about 3 MB)', async ({ page }) => {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const buffer = Buffer.concat([header, Buffer.alloc(3 * 1024 * 1024, 7)]);

  await editorBody(page).click();
  await page.keyboard.type('大きな画像');
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像' }).click();
  await (await fileChooserPromise).setFiles({ name: 'large.png', mimeType: 'image/png', buffer });
  const src = await editorBody(page).locator('img').getAttribute('src');
  expect(src?.length).toBeGreaterThan(4_000_000);
  await waitForSaved(page);

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '復元する' }).click();
  await expect(editorBody(page).locator('img')).toHaveAttribute('src', src ?? '');
});

test.describe('when saving fails', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    });
    await page.reload();
    await expect(editorBody(page)).toBeVisible();
  });

  test('shows a warning and the failed state', async ({ page }) => {
    await editorBody(page).click();
    await page.keyboard.type('保存できない内容');

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('自動保存に失敗しました');
    await expect(alert).toContainText('保存容量が不足しています');
    await expect(page.getByRole('status')).toHaveText('自動保存に失敗しました');
  });
});
