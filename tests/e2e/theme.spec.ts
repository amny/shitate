import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function themeRadio(page: Page, name: string): Locator {
  return page.getByRole('radiogroup', { name: 'テーマ' }).getByRole('radio', { name });
}

async function openFile(page: Page, name: string, buffer: Buffer): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (await fileChooserPromise).setFiles({ name, mimeType: 'text/plain', buffer });
  await expect(page.getByRole('banner')).toContainText(name);
}

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

function embeddedData(html: string): { state: { themeId: string }; theme: { css: string } } {
  const match = /<script type="application\/json" id="doc-data">(.*?)<\/script>/s.exec(html);
  if (!match?.[1]) {
    throw new Error('doc-data not found');
  }
  return JSON.parse(match[1]) as { state: { themeId: string }; theme: { css: string } };
}

function styleOf(locator: Locator, properties: string[]): Promise<Record<string, string>> {
  return locator.evaluate(
    (element, names) =>
      Object.fromEntries(
        names.map((name) => [name, getComputedStyle(element).getPropertyValue(name)]),
      ),
    properties,
  );
}

const H1_PROPERTIES = ['font-family', 'border-bottom-style', 'font-size'];
const UI_PROPERTIES = [
  'font-family',
  'font-size',
  'color',
  'background-color',
  'height',
  'padding-left',
  'border-top-width',
  'border-radius',
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await openFile(page, 'basic.md', readFileSync('fixtures/basic.md'));
});

test('switching the theme changes the editor and the export', async ({ page }) => {
  await expect(themeRadio(page, '標準')).toBeChecked();
  const h1 = editorBody(page).locator('h1');
  const standard = await styleOf(h1, H1_PROPERTIES);
  expect(standard['font-family']).toContain('Mincho');
  expect(standard['border-bottom-style']).toBe('solid');
  const standardExport = await exportHtml(page);
  expect(embeddedData(standardExport).state.themeId).toBe('standard');

  await themeRadio(page, 'シンプル').check();
  await expect(themeRadio(page, 'シンプル')).toBeChecked();
  const simple = await styleOf(h1, H1_PROPERTIES);
  expect(simple['font-family']).not.toContain('Mincho');
  expect(simple['border-bottom-style']).toBe('none');
  const cellLeft = await styleOf(editorBody(page).locator('td').first(), ['border-left-style']);
  expect(cellLeft['border-left-style']).toBe('none');

  const simpleExport = await exportHtml(page);
  expect(embeddedData(simpleExport).state.themeId).toBe('simple');
  expect(simpleExport).toContain('Built-in theme "simple"');
  expect(simpleExport).not.toContain('Built-in theme "standard"');
});

test('the editing UI is not affected by the theme', async ({ page }) => {
  const always: Record<string, Locator> = {
    header: page.getByRole('banner'),
    openButton: page.getByRole('button', { name: '開く' }),
    exportButton: page.getByRole('button', { name: 'HTMLをエクスポート' }),
    boldButton: page.getByRole('button', { name: '太字' }),
    blockSelect: page.getByRole('combobox', { name: '段落の種類' }),
    settingsPanel: page.getByRole('complementary', { name: '文書設定' }),
  };

  // Measures the UI including the table menu and the link input, each while it is shown.
  const capture = async () => {
    // No hover effects on the measured buttons.
    await page.mouse.move(0, 0);
    const result: Record<string, Record<string, string>> = {};
    for (const [name, locator] of Object.entries(always)) {
      result[name] = await styleOf(locator, UI_PROPERTIES);
    }
    await editorBody(page).locator('table td').first().locator('p').click();
    const tableMenu = page.getByRole('toolbar', { name: '表の操作' });
    result['tableMenu'] = await styleOf(tableMenu, UI_PROPERTIES);
    result['tableMenuButton'] = await styleOf(tableMenu.getByRole('button').first(), UI_PROPERTIES);

    await page.keyboard.press('ControlOrMeta+k');
    const linkInput = page.getByLabel('リンク先URL');
    result['linkInput'] = await styleOf(linkInput, UI_PROPERTIES);
    await linkInput.press('Escape');
    await expect(linkInput).toBeHidden();
    return result;
  };

  const withStandard = await capture();
  await themeRadio(page, 'シンプル').check();
  await expect(page.locator('style[data-theme-id="simple"]')).toHaveCount(1);
  expect(await capture()).toEqual(withStandard);
});

test('the selected theme is autosaved and restored', async ({ page }) => {
  await themeRadio(page, 'シンプル').check();
  await expect(page.getByRole('status')).toContainText('自動保存済み');

  await page.reload();
  await page
    .getByRole('region', { name: '前回の編集内容' })
    .getByRole('button', { name: '復元する' })
    .click();
  await expect(themeRadio(page, 'シンプル')).toBeChecked();
  await expect(page.locator('style[data-theme-id="simple"]')).toHaveCount(1);
});

test('a theme embedded in an opened file stays selectable', async ({ page }) => {
  await themeRadio(page, 'シンプル').check();
  const exported = await exportHtml(page);
  const customized = exported
    .replace('"id":"simple","name":"シンプル"', '"id":"customer","name":"顧客様向け"')
    .replace('"themeId":"simple"', '"themeId":"customer"');

  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await openFile(page, 'customer.html', Buffer.from(customized));
  await expect(themeRadio(page, '顧客様向け')).toBeChecked();

  await themeRadio(page, '標準').check();
  await expect(page.locator('style[data-theme-id="standard"]')).toHaveCount(1);
  await themeRadio(page, '顧客様向け').check();
  await expect(page.locator('style[data-theme-id="customer"]')).toHaveCount(1);
  expect(embeddedData(await exportHtml(page)).state.themeId).toBe('customer');
});
