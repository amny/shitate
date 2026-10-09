import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

const RED = 'rgb(200, 0, 0)';
const CUSTOM_CSS = `\n.doc .doc-body p { color: ${RED}; letter-spacing: 0.1em; }\n.doc .doc-body h1 { border-bottom: 4px double rgb(0, 0, 200); }\n`;

const panel = (page: Page) => page.getByRole('complementary', { name: '文書設定' });
const themeEditor = (page: Page) => page.getByRole('dialog', { name: 'テーマ編集' });
const themeList = (page: Page) => themeEditor(page).getByRole('navigation', { name: 'テーマ一覧' });
const listButton = (page: Page, name: string) =>
  themeList(page).getByRole('button', { name: new RegExp(`^${name}`) });
const cssEditor = (page: Page) => themeEditor(page).getByRole('textbox', { name: 'テーマのCSS' });

async function setUpDocument(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.doc .doc-body')).toBeVisible();
  await page.evaluate(() => {
    (window as TestWindow).__shitateEditor?.commands.setContent({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '概要' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '本文の段落' }] },
      ],
    });
  });
}

async function openThemeEditor(page: Page): Promise<void> {
  await panel(page).getByRole('button', { name: 'テーマを編集…' }).click();
  await expect(cssEditor(page)).toBeVisible();
}

/** Saves a customised copy of 標準 named "顧客A様向け" (it becomes the document's theme). */
async function saveCustomTheme(page: Page): Promise<void> {
  await openThemeEditor(page);
  await themeEditor(page).getByLabel('テーマ名').fill('顧客A様向け');
  await cssEditor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(CUSTOM_CSS);
  await themeEditor(page).getByRole('tab', { name: '設定値' }).click();
  await themeEditor(page).getByLabel('Copyright').fill('© 2026 "顧客A"');
  await themeEditor(page).getByRole('button', { name: '保存' }).click();
  await expect(listButton(page, '顧客A様向け')).toBeVisible();
}

/** Styles that show what the theme does to the document. */
async function documentLook(page: Page) {
  return page.locator('.doc.editor-paper').evaluate((paper) => {
    const pick = (selector: string, properties: string[]) => {
      const element = paper.querySelector(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(p)]));
    };
    return {
      p: pick('.doc-body p', ['color', 'letter-spacing', 'font-family', 'font-size']),
      h1: pick('.doc-body h1', ['border-bottom', 'font-family', 'font-size']),
      footer: paper.querySelector('.doc-copyright')?.textContent ?? null,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await setUpDocument(page);
});

test('an exported theme imported elsewhere looks the same', async ({ page, browser }) => {
  await saveCustomTheme(page);
  const look = await documentLook(page);
  expect(look.p?.['color']).toBe(RED);
  expect(look.footer).toBe('© 2026 "顧客A"');

  const downloadPromise = page.waitForEvent('download');
  await themeEditor(page).getByRole('button', { name: '書き出し' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('顧客A様向け.theme.json');
  const file = readFileSync(await download.path(), 'utf8');

  // Another environment: a new browser context with empty storage.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await setUpDocument(other);
  expect((await documentLook(other)).p?.['color']).not.toBe(RED);
  await openThemeEditor(other);
  const chooser = other.waitForEvent('filechooser');
  await themeEditor(other).getByRole('button', { name: '読み込み' }).click();
  await (
    await chooser
  ).setFiles({
    name: '顧客A様向け.theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  await expect(listButton(other, '顧客A様向け')).toHaveAttribute('aria-current', 'true');
  await expect(themeEditor(other).getByText('元のテーマ：標準')).toBeVisible();
  await themeEditor(other).getByRole('button', { name: '編集に戻る' }).click();

  await panel(other)
    .getByRole('radio', { name: /顧客A様向け/ })
    .check();
  await expect.poll(() => documentLook(other)).toEqual(look);
  await otherContext.close();
});

test('importing the same theme twice does not add it again', async ({ page }) => {
  await saveCustomTheme(page);
  const downloadPromise = page.waitForEvent('download');
  await themeEditor(page).getByRole('button', { name: '書き出し' }).click();
  const file = readFileSync(await (await downloadPromise).path(), 'utf8');

  const chooser = page.waitForEvent('filechooser');
  await themeEditor(page).getByRole('button', { name: '読み込み' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'a.theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file),
  });
  await expect(themeEditor(page).getByRole('alert')).toContainText(
    '「顧客A様向け」は既にユーザーテーマにあります',
  );
  await expect(listButton(page, '顧客A様向け')).toHaveCount(1);
});

test('broken files and CSS outside the contract are not imported', async ({ page }) => {
  await openThemeEditor(page);
  for (const [content, message] of [
    ['{"type":"doc"}', 'テーマのファイルではありません'],
    [
      JSON.stringify({
        format: 'shitate-theme',
        version: 1,
        theme: {
          id: 'theme-bad00001',
          name: '壊す',
          builtIn: false,
          css: 'body { display: none; }',
          settings: {
            tocDepth: 3,
            page: { size: 'A4', orientation: 'portrait', margin: 'normal', baseFontPt: 10.5 },
          },
        },
      }),
      'テーマ契約に合わないため読み込めません',
    ],
  ] as const) {
    const chooser = page.waitForEvent('filechooser');
    await themeEditor(page).getByRole('button', { name: '読み込み' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'x.theme.json',
      mimeType: 'application/json',
      buffer: Buffer.from(content),
    });
    await expect(themeEditor(page).getByRole('alert')).toContainText(message);
  }
  await expect(listButton(page, '壊す')).toHaveCount(0);
});

test('duplicating a built-in and a user theme', async ({ page }) => {
  await openThemeEditor(page);
  await themeEditor(page).getByRole('button', { name: 'テーマを複製' }).click();
  await expect(listButton(page, '標準のコピー')).toHaveAttribute('aria-current', 'true');
  await expect(themeEditor(page).getByText('元のテーマ：標準')).toBeVisible();

  await themeEditor(page).getByRole('button', { name: 'テーマを複製' }).click();
  await expect(listButton(page, '標準のコピーのコピー')).toHaveAttribute('aria-current', 'true');

  // Unsaved changes have to be saved first.
  await cssEditor(page).click();
  await page.keyboard.insertText('\n.doc { color: red; }\n');
  await expect(themeEditor(page).getByRole('button', { name: 'テーマを複製' })).toBeDisabled();
  await expect(themeEditor(page).getByRole('button', { name: '書き出し' })).toBeDisabled();
});

test('deleting the theme the document uses keeps the document as it is', async ({ page }) => {
  await saveCustomTheme(page);
  const look = await documentLook(page);
  // Built-ins cannot be deleted.
  await listButton(page, '標準').first().click();
  await expect(themeEditor(page).getByRole('button', { name: '削除' })).toBeDisabled();

  await listButton(page, '顧客A様向け').click();
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe(
      '「顧客A様向け」はこの文書で使用中です。削除しても、この文書には埋め込まれたテーマとして残ります。削除しますか？',
    );
    void dialog.accept();
  });
  await themeEditor(page).getByRole('button', { name: '削除' }).click();
  await expect(listButton(page, '顧客A様向け')).toHaveCount(0);
  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();

  await expect(
    panel(page).getByRole('radio', { name: /この文書に含まれていたテーマ/ }),
  ).toBeChecked();
  expect(await documentLook(page)).toEqual(look);

  // Gone from storage too.
  await page.reload();
  await expect(page.locator('.doc .doc-body')).toBeVisible();
  await expect(panel(page).getByText('標準をもとに編集')).toHaveCount(0);
});
