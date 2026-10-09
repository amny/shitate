import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// 1x1 transparent PNG
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const LOGO_URI = `data:image/png;base64,${PNG_BASE64}`;

const panel = (page: Page) => page.getByRole('complementary', { name: '文書設定' });
const paper = (page: Page) => page.locator('.doc.editor-paper');
const overrideCheck = (page: Page) => panel(page).getByLabel('この文書だけ上書きする');
const copyrightInput = (page: Page) => panel(page).getByLabel('Copyright');

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

async function chooseLogo(page: Page): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await panel(page)
    .getByRole('button', { name: /画像を選択/ })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.doc .doc-body')).toBeVisible();
});

test('the theme values are read-only until the document overrides them', async ({ page }) => {
  await expect(overrideCheck(page)).not.toBeChecked();
  await expect(copyrightInput(page)).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'ロゴなし' })).toBeDisabled();

  await overrideCheck(page).check();
  await expect(copyrightInput(page)).toBeEnabled();
  await copyrightInput(page).fill('© 2026 サンプル');
  await expect(paper(page).locator('.doc-copyright')).toHaveText('© 2026 サンプル');

  // Back to the theme's values (none for the built-in themes).
  await overrideCheck(page).uncheck();
  await expect(copyrightInput(page)).toHaveValue('');
  await expect(paper(page).locator('.doc-footer')).toHaveCount(0);
});

test('the logo is stored and exported as a data URI', async ({ page }) => {
  await overrideCheck(page).check();
  await chooseLogo(page);
  await expect(panel(page).getByRole('img', { name: 'ロゴ画像' })).toHaveAttribute('src', LOGO_URI);
  await expect(paper(page).locator('.doc-header .doc-logo')).toHaveAttribute('src', LOGO_URI);

  const html = await exportHtml(page);
  expect(html).toContain(`<img class="doc-logo" src="${LOGO_URI}" alt="ロゴ">`);
  expect(html).toContain(`--header-logo:url("${LOGO_URI}")`);
  expect(html).toContain(`"logoDataUri":"${LOGO_URI}"`);

  await panel(page).getByRole('button', { name: '削除' }).click();
  await expect(paper(page).locator('.doc-header')).toHaveCount(0);
});

test('a copyright with quotes does not break the export', async ({ page }) => {
  const copyright = '© 2026 "サンプル" </style><script>alert(1)</script> \\';
  await overrideCheck(page).check();
  await copyrightInput(page).fill(copyright);
  const html = await exportHtml(page);

  await page.setContent(html);
  await expect(page.locator('.doc-copyright')).toHaveText(copyright);
  expect(await page.locator('script').count()).toBe(1);
  const variable = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--copyright').trim(),
  );
  expect(variable.startsWith('"© 2026 \\"サンプル\\"')).toBe(true);
});

test('the export shows the header first and the footer last, once each', async ({ page }) => {
  await overrideCheck(page).check();
  await chooseLogo(page);
  await copyrightInput(page).fill('© 2026 サンプル');
  await page.locator('.doc .doc-body').click();
  await page.keyboard.type('本文');
  const html = await exportHtml(page);

  await page.setContent(html);
  const order = await page
    .locator('.doc > *')
    .evaluateAll((elements: Element[]) => elements.map((el) => el.getAttribute('class') ?? ''));
  expect(order[0]).toBe('doc-header');
  expect(order.at(-1)).toBe('doc-footer');
  await expect(page.locator('.doc-header')).toHaveCount(1);
  await expect(page.locator('.doc-footer')).toHaveCount(1);
  // Visible at the top and the bottom of the document.
  const header = await page.locator('.doc-header').boundingBox();
  const body = await page.locator('.doc-body').boundingBox();
  const footer = await page.locator('.doc-footer').boundingBox();
  expect(header && body && footer && header.y < body.y && body.y < footer.y).toBe(true);
});

test('clicking the header or footer preview opens the theme tab', async ({ page }) => {
  await overrideCheck(page).check();
  await copyrightInput(page).fill('© 2026 サンプル');
  await panel(page).getByRole('tab', { name: '表紙' }).click();
  await paper(page).locator('.doc-footer').click();
  await expect(panel(page).getByRole('tab', { name: 'テーマ' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
