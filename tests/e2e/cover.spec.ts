import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const panel = (page: Page) => page.getByRole('complementary', { name: '文書設定' });
const tab = (page: Page, name: string) => panel(page).getByRole('tab', { name });
const paper = (page: Page) => page.locator('.doc.editor-paper');
const revisionCards = (page: Page) => panel(page).getByRole('listitem');

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

async function fillCover(page: Page): Promise<void> {
  await tab(page, '表紙').click();
  await panel(page).getByLabel('タイトル').fill('基本設計書');
  await panel(page).getByLabel('案件名').fill('顧客管理システム構築');
  await panel(page).getByLabel('版数').fill('1.1');
  await panel(page).getByLabel('日付').fill('2026-10-01');
  await panel(page).getByLabel('会社名').fill('株式会社サンプル');
  await panel(page).getByLabel('顧客名（任意）').fill('顧客株式会社');
}

/** Adds a revision and fills its description and author. */
async function addRevision(page: Page, description: string, author: string): Promise<void> {
  await panel(page).getByRole('button', { name: '履歴を追加' }).click();
  const card = revisionCards(page).last();
  await card.getByLabel('内容').fill(description);
  await card.getByLabel('担当').fill(author);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.doc .doc-body')).toBeVisible();
});

test('the settings panel has the cover, revisions and theme tabs', async ({ page }) => {
  await expect(panel(page).getByRole('tab')).toHaveText(['表紙', '改訂履歴', 'テーマ']);
  await expect(tab(page, 'テーマ')).toHaveAttribute('aria-selected', 'true');
  await tab(page, 'テーマ').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, '表紙')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, '表紙')).toBeFocused();
});

test('the cover form shows a preview above the body and in the export', async ({ page }) => {
  await expect(paper(page).locator('.doc-cover')).toHaveCount(0);
  await fillCover(page);

  const cover = paper(page).locator('.doc-cover');
  await expect(cover.locator('> *')).toHaveText([
    '顧客株式会社 御中',
    '顧客管理システム構築',
    '基本設計書',
    '第1.1版',
    '2026年10月1日',
    '株式会社サンプル',
  ]);
  // The preview is outside the editable body.
  await expect(page.locator('.doc-body .doc-cover')).toHaveCount(0);

  const html = await exportHtml(page);
  expect(html).toContain('<h1 class="cover-title">基本設計書</h1>');
  expect(html).toContain('<div class="cover-date">2026年10月1日</div>');
});

test('revisions can be added, edited, reordered and removed', async ({ page }) => {
  await fillCover(page);
  await tab(page, '改訂履歴').click();
  await addRevision(page, '初版', '山田');
  await addRevision(page, '2章を修正', '佐藤');

  // A new row takes the cover's version.
  await expect(revisionCards(page).first().getByLabel('版')).toHaveValue('1.1');
  await revisionCards(page).first().getByLabel('版').fill('1.0');

  const rows = paper(page).locator('.doc-revisions tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('td')).toHaveText(['1.0', /年/, '初版', '山田']);

  await panel(page).getByRole('button', { name: '改訂履歴2を上へ' }).click();
  await expect(rows.locator('td:nth-child(3)')).toHaveText(['2章を修正', '初版']);
  await expect(panel(page).getByRole('button', { name: '改訂履歴1を上へ' })).toBeDisabled();

  await panel(page).getByRole('button', { name: '改訂履歴1を削除' }).click();
  await expect(rows.locator('td:nth-child(3)')).toHaveText(['初版']);

  const html = await exportHtml(page);
  expect(html).toMatch(/<td>1\.0<\/td><td>2026年\d+月\d+日<\/td><td>初版<\/td><td>山田<\/td>/);
});

test('clicking the preview opens the matching tab', async ({ page }) => {
  await fillCover(page);
  await tab(page, '改訂履歴').click();
  await addRevision(page, '初版', '山田');
  await tab(page, 'テーマ').click();

  await paper(page).locator('.doc-cover').click();
  await expect(tab(page, '表紙')).toHaveAttribute('aria-selected', 'true');
  await paper(page).locator('.doc-revisions').click();
  await expect(tab(page, '改訂履歴')).toHaveAttribute('aria-selected', 'true');
});

test('the cover and revisions are restored from the exported file', async ({ page }) => {
  await fillCover(page);
  await tab(page, '改訂履歴').click();
  await addRevision(page, '初版\n誤記を修正', '山田');
  const html = await exportHtml(page);

  // Change everything after the export, then open the exported file.
  await panel(page).getByRole('button', { name: '改訂履歴1を削除' }).click();
  await tab(page, '表紙').click();
  await panel(page).getByLabel('タイトル').fill('別の文書');
  await panel(page).getByLabel('案件名').fill('');
  await expect(paper(page).locator('.doc-revisions')).toHaveCount(0);
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'exported.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await expect(paper(page).locator('.cover-title')).toHaveText('基本設計書');
  await expect(paper(page).locator('.doc-revisions td:nth-child(3)')).toHaveText([
    '初版誤記を修正',
  ]);
  await tab(page, '表紙').click();
  await expect(panel(page).getByLabel('案件名')).toHaveValue('顧客管理システム構築');
  await tab(page, '改訂履歴').click();
  await expect(revisionCards(page).first().getByLabel('内容')).toHaveValue('初版\n誤記を修正');
});
