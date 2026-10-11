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

function savedDocuments(page: Page): Locator {
  return page.getByRole('dialog', { name: '保存済みの文書' });
}

async function typeNewDocument(page: Page, text: string): Promise<void> {
  await page.getByRole('button', { name: '新規' }).click();
  await editorBody(page).click();
  await page.keyboard.type(text);
  await waitForSaved(page);
}

test('restores the previous edit after a reload', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('自動保存のテスト');
  await waitForSaved(page);

  await page.reload();
  await expect(restoreBanner(page)).toContainText('前回の文書を開きますか？');
  // Without a cover title or a file name, the document is named by the start of its body.
  await expect(restoreBanner(page)).toContainText('「自動保存のテスト」');
  await expect(editorBody(page)).not.toContainText('自動保存のテスト');

  await restoreBanner(page).getByRole('button', { name: '開く' }).click();
  await expect(editorBody(page)).toContainText('自動保存のテスト');
  await expect(restoreBanner(page)).toBeHidden();
});

test('restores an opened file together with its file name', async ({ page }) => {
  await openFixture(page, 'complex-table.html');
  await waitForSaved(page);
  const before = await editorBody(page).innerHTML();

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '開く' }).click();
  await expect(page.getByRole('banner')).toContainText('complex-table.html');
  await expect(editorBody(page).locator('td[rowspan="2"]')).toHaveCount(2);
  expect(await editorBody(page).innerHTML()).toBe(before);
});

test('typing before answering keeps both documents', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('前の文書');
  await waitForSaved(page);

  await page.reload();
  await expect(restoreBanner(page)).toBeVisible();
  await editorBody(page).click();
  await page.keyboard.type('新しい文書');
  await waitForSaved(page);

  await restoreBanner(page).getByRole('button', { name: '開く' }).click();
  await expect(editorBody(page)).toHaveText('前の文書');
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(savedDocuments(page).getByRole('listitem')).toHaveCount(2);
});

test('an untouched startup document is not saved', async ({ page }) => {
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(savedDocuments(page)).toContainText('保存済みの文書はありません');
});

test('closing the banner keeps the saved document', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('残す内容');
  await waitForSaved(page);

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '閉じる' }).click();
  await expect(restoreBanner(page)).toBeHidden();
  await expect(editorBody(page)).not.toContainText('残す内容');

  await page.reload();
  await expect(restoreBanner(page)).toBeVisible();
});

test('saves several documents and opens the chosen one', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('文書A');
  await waitForSaved(page);
  await typeNewDocument(page, '文書B');
  await openFixture(page, 'basic.md');
  await waitForSaved(page);

  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  const items = savedDocuments(page).getByRole('listitem');
  // Newest first; the current document is marked and cannot be opened or deleted.
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('basic.md');
  await expect(items.nth(0)).toContainText('編集中');
  await expect(items.nth(0).getByRole('button', { name: '開く' })).toBeDisabled();
  await expect(items.nth(0).getByRole('button', { name: '削除' })).toBeDisabled();

  await items.nth(2).getByRole('button', { name: '開く' }).click();
  await expect(savedDocuments(page)).toBeHidden();
  await expect(editorBody(page)).toHaveText('文書A');
  await expect(page.getByRole('banner')).not.toContainText('basic.md');

  // Edits go to the opened document, not to the one opened before it.
  await page.keyboard.press('End');
  await page.keyboard.type('（追記）');
  await waitForSaved(page);
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(items).toHaveCount(3);
  await items.filter({ hasText: 'basic.md' }).getByRole('button', { name: '開く' }).click();
  await expect(editorBody(page).locator('h1')).toHaveCount(1);
  await expect(page.getByRole('banner')).toContainText('basic.md');

  await page.reload();
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(items).toHaveCount(3);
});

test('deletes a saved document after confirmation', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('消す文書');
  await waitForSaved(page);
  await typeNewDocument(page, '残る文書');

  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  const items = savedDocuments(page).getByRole('listitem');
  await expect(items).toHaveCount(2);

  page.once('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await items.nth(1).getByRole('button', { name: '削除' }).click();
  await expect(items).toHaveCount(2);

  let message = '';
  page.once('dialog', (dialog) => {
    message = dialog.message();
    void dialog.accept();
  });
  await items.nth(1).getByRole('button', { name: '削除' }).click();
  await expect(items).toHaveCount(1);
  expect(message).toBe('「消す文書」を削除しますか？この操作は元に戻せません。');

  await page.reload();
  await expect(restoreBanner(page)).toBeVisible();
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(items).toHaveCount(1);
  await expect(items).toContainText('残る文書');
});

test('a new document starts empty and cannot undo into the previous one', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('前の文書');
  await waitForSaved(page);

  await page.getByRole('button', { name: '新規' }).click();
  await expect(editorBody(page)).toHaveText('');
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();
});

test('opens the draft saved before documents had their own slots', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('以前の下書き');
  await waitForSaved(page);

  // Turn the saved document into the single "drafts/current" of task 1-5.
  await page.evaluate(async () => {
    const request = indexedDB.open('shitate');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
    });
    const tx = db.transaction(['drafts', 'draftMeta'], 'readwrite');
    const drafts = tx.objectStore('drafts');
    const cursorRequest = drafts.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      drafts.put(cursor.value, 'current');
      cursor.delete();
    };
    tx.objectStore('draftMeta').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('Failed to rewrite drafts'));
      };
    });
    db.close();
  });

  await page.reload();
  await restoreBanner(page).getByRole('button', { name: '開く' }).click();
  await expect(editorBody(page)).toHaveText('以前の下書き');
  await page.getByRole('button', { name: '保存済みの文書', exact: true }).click();
  await expect(savedDocuments(page).getByRole('listitem')).toHaveCount(1);
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
  await restoreBanner(page).getByRole('button', { name: '開く' }).click();
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
