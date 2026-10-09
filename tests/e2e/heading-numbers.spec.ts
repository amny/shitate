import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  state: { selection: { anchor: number } };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function numbers(page: Page): Locator {
  return editorBody(page).locator('.heading-number');
}

/** Clicks and waits until the editor has picked up the DOM selection (read asynchronously). */
async function clickIn(page: Page, target: Locator): Promise<void> {
  await target.click();
  await page.waitForFunction(() => {
    const editor = (window as TestWindow).__shitateEditor;
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode) return false;
    return (
      editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset) ===
      editor.state.selection.anchor
    );
  });
}

const blockSelect = (page: Page) => page.getByRole('combobox', { name: '段落の種類' });
const numberToggle = (page: Page) => page.getByRole('button', { name: '見出し番号' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    const h = (level: number, text: string) => ({
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text }],
    });
    editor.commands.setContent({
      type: 'doc',
      content: [h(1, 'はじめに'), h(2, '目的'), h(2, '範囲'), h(1, '設計'), { type: 'paragraph' }],
    });
  });
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.2', '2']);
});

test('numbers update when a heading is added', async ({ page }) => {
  await clickIn(page, editorBody(page).locator('p').last());
  await page.keyboard.type('新しい章');
  await blockSelect(page).selectOption('h1');
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.2', '2', '3']);
  await expect(editorBody(page).locator('h1').last()).toHaveText('3新しい章');
});

test('numbers update when a heading is deleted', async ({ page }) => {
  await editorBody(page).locator('h2').first().click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(numbers(page)).toHaveText(['1', '1.1', '2']);
  await expect(editorBody(page).locator('h2')).toHaveText(['1.1範囲']);
});

test('numbers update when a heading level changes', async ({ page }) => {
  await clickIn(page, editorBody(page).locator('h2').first());
  await blockSelect(page).selectOption('h1');
  await expect(numbers(page)).toHaveText(['1', '2', '2.1', '3']);
  await page.keyboard.press('ControlOrMeta+Alt+3');
  await expect(numbers(page)).toHaveText(['1', '1.1.1', '1.2', '2']);
});

test('the toggle turns numbering off and on', async ({ page }) => {
  await clickIn(page, editorBody(page).locator('h1').first());
  await expect(numberToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await numberToggle(page).click();
  await expect(numberToggle(page)).toHaveAttribute('aria-pressed', 'false');
  // Its sub-headings are not numbered either, and the next chapter starts at 1.
  await expect(editorBody(page).locator('h1').first()).toHaveText('はじめに');
  await expect(editorBody(page).locator('h2')).toHaveText(['目的', '範囲']);
  await expect(numbers(page)).toHaveText(['1']);
  await expect(editorBody(page).locator('h1').last()).toHaveText('1設計');

  await numberToggle(page).click();
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.2', '2']);
});

test('sub-headings of an unnumbered heading cannot be numbered on their own', async ({ page }) => {
  await clickIn(page, editorBody(page).locator('h1').first());
  await numberToggle(page).click();

  await clickIn(page, editorBody(page).locator('h2').first());
  await expect(numberToggle(page)).toBeDisabled();
  await expect(numberToggle(page)).toHaveAttribute('title', /上位の見出しが採番しないため/);

  // Outside the unnumbered section the toggle works again.
  await clickIn(page, editorBody(page).locator('h1').last());
  await expect(numberToggle(page)).toBeEnabled();
  await expect(numberToggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the toggle is disabled outside headings and on H6', async ({ page }) => {
  await clickIn(page, editorBody(page).locator('p').last());
  await expect(numberToggle(page)).toBeDisabled();
  await clickIn(page, editorBody(page).locator('h1').last());
  await blockSelect(page).selectOption('h6');
  await expect(numberToggle(page)).toBeDisabled();
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.2']);
});

test('numbers are not part of the text and are not copied', async ({ page }) => {
  await editorBody(page).locator('h2').first().click({ clickCount: 3 });
  const copied = await page.evaluate(() => {
    const data = new DataTransfer();
    document
      .querySelector('.doc-body')
      ?.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    return { text: data.getData('text/plain'), html: data.getData('text/html') };
  });
  expect(copied.text).toBe('目的');
  expect(copied.html).not.toContain('heading-number');
  // The caret cannot enter the number.
  await expect(numbers(page).first()).toHaveAttribute('contenteditable', 'false');
});

test('the exported HTML contains numbers and ids', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const html = readFileSync(await (await downloadPromise).path(), 'utf8');
  const headings = [
    ...html.matchAll(
      /<h([12]) id="(h-[0-9a-z]{8})"><span class="heading-number">([\d.]+)<\/span>([^<]+)<\/h\1>/g,
    ),
  ].map((m) => `${m[3]} ${m[4]}`);
  expect(headings).toEqual(['1 はじめに', '1.1 目的', '1.2 範囲', '2 設計']);
});
