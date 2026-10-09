import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

const RED = 'rgb(200, 0, 0)';
const RED_RULE = `\n.doc .doc-body p { color: ${RED}; }\n`;

const panel = (page: Page) => page.getByRole('complementary', { name: '文書設定' });
const themeEditor = (page: Page) => page.getByRole('dialog', { name: 'テーマ編集' });
const themeList = (page: Page) => themeEditor(page).getByRole('navigation', { name: 'テーマ一覧' });
const cssEditor = (page: Page) => themeEditor(page).getByRole('textbox', { name: 'テーマのCSS' });
const saveButton = (page: Page) => themeEditor(page).getByRole('button', { name: '保存' });
const editorParagraph = (page: Page) => page.locator('.doc .doc-body p').first();

async function paragraphColor(page: Page): Promise<string> {
  return editorParagraph(page).evaluate((p) => getComputedStyle(p).color);
}

async function openThemeEditor(page: Page): Promise<void> {
  await panel(page).getByRole('button', { name: 'テーマを編集…' }).click();
  await expect(cssEditor(page)).toBeVisible();
}

/** Adds CSS at the end of the editor (insertText: no auto-closed brackets). */
async function appendCss(page: Page, css: string): Promise<void> {
  await cssEditor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(css);
}

/**
 * The CSS being edited, read from the screen preview's theme <style> (CodeMirror renders only
 * the visible lines). The preview follows the editor 0.4 s after typing stops.
 */
async function cssText(page: Page): Promise<string> {
  return page
    .frameLocator('iframe[title="テーマのプレビュー（画面）"]')
    .locator('style#theme')
    .evaluate((style) => style.textContent);
}

/** Saves the built-in "標準" with a red paragraph rule as a user theme. */
async function saveRedCopyOfStandard(page: Page): Promise<void> {
  await openThemeEditor(page);
  await appendCss(page, RED_RULE);
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();
  await expect(themeList(page).getByRole('button', { name: /標準（編集）/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
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
});

test('editing a built-in saves a user theme and leaves the built-in unchanged', async ({
  page,
}) => {
  const original = await paragraphColor(page);
  await openThemeEditor(page);
  await expect(themeEditor(page).getByText('元のテーマ：標準')).toBeVisible();
  await expect(themeEditor(page).getByLabel('テーマ名')).toHaveValue('標準（編集）');
  await expect(themeEditor(page).getByRole('status').last()).toContainText(
    'ビルトインテーマは直接変更されません',
  );
  const builtinCss = await cssText(page);
  expect(builtinCss).toContain('.doc');

  await appendCss(page, RED_RULE);
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();

  // The built-in in the list still has its own CSS.
  await themeList(page).getByRole('button', { name: '標準', exact: true }).click();
  await expect(themeEditor(page).getByLabel('テーマ名')).toHaveValue('標準（編集）');
  await expect.poll(() => cssText(page)).toBe(builtinCss);

  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();
  // The saved copy is the document's theme now.
  await expect(panel(page).getByRole('radio', { name: /標準（編集）/ })).toBeChecked();
  await expect.poll(() => paragraphColor(page)).toBe(RED);

  await panel(page)
    .getByRole('radio', { name: /^標準 / })
    .check();
  await expect.poll(() => paragraphColor(page)).toBe(original);
});

test('"初期状態に戻す" brings back the CSS of the base built-in', async ({ page }) => {
  await saveRedCopyOfStandard(page);
  const resetButton = themeEditor(page).getByRole('button', { name: '初期状態に戻す' });
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await expect.poll(() => cssText(page)).not.toContain(RED);
  await expect(resetButton).toBeDisabled();
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();

  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();
  await expect.poll(() => paragraphColor(page)).not.toBe(RED);
});

test('cancel and closing without saving leave nothing behind', async ({ page }) => {
  await openThemeEditor(page);
  const css = await cssText(page);
  await appendCss(page, RED_RULE);
  await expect.poll(() => cssText(page)).toContain(RED);

  page.once('dialog', (dialog) => {
    expect(dialog.message()).toBe('保存していない変更があります。破棄しますか？');
    void dialog.accept();
  });
  await themeEditor(page).getByRole('button', { name: 'キャンセル' }).click();
  await expect.poll(() => cssText(page)).toBe(css);

  await appendCss(page, RED_RULE);
  page.once('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();
  await expect(themeEditor(page)).toBeVisible();
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();
  await expect(themeEditor(page)).toHaveCount(0);
  await expect(panel(page).getByRole('radio', { name: /編集/ })).toHaveCount(0);
});

test('CSS outside the theme contract cannot be saved', async ({ page }) => {
  await openThemeEditor(page);
  await appendCss(page, '\nbody { display: none; }\n.doc .my-class { color: red; }\n');
  const alert = themeEditor(page).getByRole('alert');
  await expect(alert).toContainText('テーマ契約に合わないため保存できません（2件）');
  await expect(alert).toContainText('「body」は .doc で始まっていません');
  await expect(alert).toContainText('.my-class は使えるクラスにありません');
  await expect(saveButton(page)).toBeDisabled();
  // The app itself is not affected while editing.
  await expect(page.locator('body')).toBeVisible();
});

test('the preview follows the CSS being edited', async ({ page }) => {
  await openThemeEditor(page);
  const preview = page.frameLocator('iframe[title="テーマのプレビュー（画面）"]');
  await expect(preview.locator('.doc-body p')).toHaveText('本文の段落');
  await appendCss(page, RED_RULE);
  await expect
    .poll(() => preview.locator('.doc-body p').evaluate((p) => getComputedStyle(p).color))
    .toBe(RED);
  // The editor behind uses the document's theme, not the draft.
  expect(await paragraphColor(page)).not.toBe(RED);

  await themeEditor(page).getByRole('tab', { name: 'PDF' }).click();
  await expect(themeEditor(page).getByText(/^全 \d+ ページ$/)).toBeVisible({ timeout: 30_000 });
  const pdf = page.frameLocator('iframe[title="テーマのプレビュー（PDF）"]');
  await expect
    .poll(() =>
      pdf
        .locator('.doc-body p')
        .first()
        .evaluate((p) => getComputedStyle(p).color),
    )
    .toBe(RED);
});

test('theme setting values are used by documents without overrides', async ({ page }) => {
  await openThemeEditor(page);
  await themeEditor(page).getByRole('tab', { name: '設定値' }).click();
  await themeEditor(page).getByLabel('Copyright').fill('© 2026 テーマの会社');
  await saveButton(page).click();
  await expect(saveButton(page)).toBeDisabled();
  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();

  await expect(page.locator('.doc.editor-paper .doc-copyright')).toHaveText('© 2026 テーマの会社');
  await expect(panel(page).getByLabel('Copyright')).toHaveValue('© 2026 テーマの会社');
  await expect(panel(page).getByLabel('Copyright')).toBeDisabled();
});

test('user themes are kept after reloading', async ({ page }) => {
  await saveRedCopyOfStandard(page);
  await themeEditor(page).getByRole('button', { name: '編集に戻る' }).click();

  await page.reload();
  await expect(page.locator('.doc .doc-body')).toBeVisible();
  await expect(panel(page).getByRole('radio', { name: /標準（編集）/ })).toBeVisible();
  await expect(panel(page).getByText('標準をもとに編集')).toBeVisible();
});
