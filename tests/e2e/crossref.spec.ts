import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestChain {
  insertContentAt: (position: number, content: unknown) => TestChain;
  setTextSelection: (position: number) => TestChain;
  focus: () => TestChain;
  run: () => boolean;
}
interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  chain: () => TestChain;
  state: { selection: { anchor: number }; doc: { content: { size: number } } };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

const refs = (page: Page) => editorBody(page).locator('.xref');
const dialog = (page: Page) => page.getByRole('dialog', { name: '参照を挿入' });
const search = (page: Page) => dialog(page).getByRole('combobox', { name: '参照先の絞り込み' });

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

/** Puts the cursor at the end of the paragraph that says "参照：". */
async function cursorAtReferenceParagraph(page: Page): Promise<void> {
  await clickIn(page, editorBody(page).locator('p', { hasText: '参照：' }));
  // End does not move to the line end in a contenteditable on macOS.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    const text = (value: string) => ({ type: 'text', text: value });
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [text('はじめに')] },
        { type: 'heading', attrs: { level: 2 }, content: [text('目的')] },
        { type: 'paragraph', content: [text('参照：')] },
        { type: 'heading', attrs: { level: 1 }, content: [text('画面設計')] },
        {
          type: 'tableFigure',
          content: [
            { type: 'tableCaption', content: [text('画面一覧')] },
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    { type: 'tableCell', content: [{ type: 'paragraph', content: [text('a')] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});

test('inserts a reference from the dialog with the keyboard', async ({ page }) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await expect(dialog(page).getByRole('option')).toHaveText([
    /見出し\s*1\s*はじめに/,
    /見出し\s*1\.1\s*目的/,
    /見出し\s*2\s*画面設計/,
    /表\s*表1\s*画面一覧/,
  ]);
  await expect(search(page)).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(dialog(page).getByRole('option', { selected: true })).toContainText('目的');
  await page.keyboard.press('Enter');
  await expect(dialog(page)).toBeHidden();
  await expect(refs(page)).toHaveCount(1);
  await expect(refs(page)).toHaveAttribute('data-label', '1.1節');
  await expect(editorBody(page).locator('p', { hasText: '参照：' }).locator('.xref')).toHaveCount(
    1,
  );
});

test('filters the targets and inserts a table reference by clicking', async ({ page }) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await search(page).fill('一覧');
  await expect(dialog(page).getByRole('option')).toHaveCount(1);
  await dialog(page).getByRole('option').click();
  await expect(refs(page)).toHaveAttribute('data-label', '表1');
});

test('Escape and an Enter that confirms IME conversion do not insert', async ({ page }) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await search(page).dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(refs(page)).toHaveCount(0);
});

test('a reference follows the target number and warns when the target is gone', async ({
  page,
}) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await search(page).fill('画面設計');
  await page.keyboard.press('Enter');
  await expect(refs(page)).toHaveAttribute('data-label', '2節');

  // Turn the first chapter into an unnumbered heading: the target becomes chapter 1.
  await clickIn(page, editorBody(page).locator('h1').first());
  await page.getByRole('button', { name: '見出し番号' }).click();
  await expect(refs(page)).toHaveAttribute('data-label', '1節');

  // Delete the target heading.
  await editorBody(page).locator('h1').last().click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(refs(page)).toHaveAttribute('data-label', '参照先なし');
  await expect(refs(page)).toHaveClass(/is-broken/);
});

test('copy-pasting a range with the target keeps references on the original', async ({ page }) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await search(page).fill('目的');
  await page.keyboard.press('Enter');
  await expect(refs(page)).toHaveAttribute('data-label', '1.1節');
  const originalTarget = await refs(page).getAttribute('data-target-id');

  // Copy everything (both the target heading and the reference). Focus the editor first:
  // after the dialog closes, focus returns to the editor asynchronously.
  await clickIn(page, editorBody(page).locator('p', { hasText: '参照：' }));
  await page.keyboard.press('ControlOrMeta+a');
  const clip = await page.evaluate(() => {
    const data = new DataTransfer();
    document
      .querySelector('.doc-body')
      ?.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    return { html: data.getData('text/html'), text: data.getData('text/plain') };
  });
  expect(clip.html).toContain('data-target-id');
  // Paste into a new empty paragraph at the end of the document.
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    const end = editor.state.doc.content.size;
    editor
      .chain()
      .insertContentAt(end, { type: 'paragraph' })
      .setTextSelection(end + 1)
      .focus()
      .run();
  });
  await page.evaluate(({ html, text }) => {
    const data = new DataTransfer();
    data.setData('text/html', html);
    data.setData('text/plain', text);
    document
      .querySelector('.doc-body')
      ?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
  }, clip);

  await expect(editorBody(page).locator('h2')).toHaveCount(2);
  await expect(refs(page)).toHaveCount(2);
  // Both the original and the pasted reference still point at the original heading.
  for (const ref of await refs(page).all()) {
    await expect(ref).toHaveAttribute('data-target-id', originalTarget ?? '');
    await expect(ref).toHaveAttribute('data-label', '1.1節');
  }
  const ids = await editorBody(page)
    .locator('h2')
    .evaluateAll((hs) => hs.map((h) => h.id));
  expect(ids[0]).toBe(originalTarget);
  expect(ids[1]).not.toBe(originalTarget);
});

test('the exported HTML links references to their targets', async ({ page }) => {
  await cursorAtReferenceParagraph(page);
  await page.getByRole('button', { name: '参照を挿入' }).click();
  await search(page).fill('目的');
  await page.keyboard.press('Enter');
  const target = await refs(page).getAttribute('data-target-id');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const html = readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(html).toContain(`<a class="xref" href="#${target ?? ''}">1.1節</a>`);
  expect(html).toContain(`<h2 id="${target ?? ''}">`);
});
