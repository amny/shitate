import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  state: { selection: { anchor: number } };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

const editorBody = (page: Page): Locator => page.locator('.doc .doc-body');
const numbers = (page: Page) => editorBody(page).locator('.heading-number');
const tocItems = (page: Page) => editorBody(page).locator('.doc-toc .toc-item');
const crossRef = (page: Page) => editorBody(page).locator('[data-label]');
const outlineItems = (page: Page) =>
  page.getByRole('navigation', { name: 'アウトライン' }).locator('.outline-item');
const startLevelSelect = (page: Page) =>
  page.getByRole('combobox', { name: '見出し番号の開始レベル' });
const numberToggle = (page: Page) => page.getByRole('button', { name: '見出し番号' });

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

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    const h = (level: number, id: string, text: string) => ({
      type: 'heading',
      attrs: { level, id },
      content: [{ type: 'text', text }],
    });
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'toc' },
        h(1, 'h-start001', '概要'),
        h(2, 'h-start002', '目的'),
        h(3, 'h-start003', '背景'),
        h(2, 'h-start004', '範囲'),
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '詳細は' },
            { type: 'crossRef', attrs: { targetId: 'h-start003' } },
          ],
        },
      ],
    });
  });
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.1.1', '1.2']);
});

test('the start level renumbers the editor, the outline, the TOC and cross references', async ({
  page,
}) => {
  await expect(startLevelSelect(page)).toHaveValue('1');
  await startLevelSelect(page).selectOption('2');

  await expect(numbers(page)).toHaveText(['1', '1.1', '2']);
  await expect(tocItems(page)).toHaveText(['概要', '1目的', '1.1背景', '2範囲']);
  await expect(crossRef(page)).toHaveAttribute('data-label', '1.1節');
  await expect(outlineItems(page).filter({ hasText: '範囲' })).toHaveText('2範囲');
  await expect(outlineItems(page).filter({ hasText: '概要' })).toHaveText('概要');
  // Numbers stay out of the document text.
  await expect(editorBody(page).locator('h2').first()).toHaveText('1目的');

  await startLevelSelect(page).selectOption('1');
  await expect(numbers(page)).toHaveText(['1', '1.1', '1.1.1', '1.2']);
});

test('the numbering toggle is disabled above the start level', async ({ page }) => {
  await startLevelSelect(page).selectOption('2');
  await clickIn(page, editorBody(page).locator('h1'));
  await expect(numberToggle(page)).toBeDisabled();
  await expect(numberToggle(page)).toHaveAttribute('title', /見出し2から採番する設定/);

  await clickIn(page, editorBody(page).locator('h2').first());
  await expect(numberToggle(page)).toBeEnabled();
});

test('the export uses the start level and keeps it when reopened', async ({ page }) => {
  await startLevelSelect(page).selectOption('2');
  const html = await exportHtml(page);

  const exported = await page.evaluate((source) => {
    const dom = new DOMParser().parseFromString(source, 'text/html');
    return {
      headings: [...dom.querySelectorAll('.doc-body :is(h1, h2, h3)')].map(
        (h) => h.querySelector('.heading-number')?.textContent ?? null,
      ),
      toc: [...dom.querySelectorAll('nav.doc-toc a.toc-item')].map((a) => a.textContent),
      ref: dom.querySelector('.doc-body .xref')?.textContent ?? null,
    };
  }, html);
  expect(exported).toEqual({
    headings: [null, '1', '1.1', '2'],
    toc: ['概要', '1目的', '1.1背景', '2範囲'],
    ref: '1.1節',
  });

  await startLevelSelect(page).selectOption('1');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'exported.html',
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await expect(startLevelSelect(page)).toHaveValue('2');
  await expect(numbers(page)).toHaveText(['1', '1.1', '2']);
});
