import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mO4WR6OFTEMLQkAcq9pwfhQlf4AAAAASUVORK5CYII=';

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function tableMenu(page: Page): Locator {
  return page.getByRole('toolbar', { name: '表の操作' });
}

/** Subset of the editor exposed as window.__shitateEditor (src/editor/devHook.ts, dev only). */
interface TestEditor {
  getHTML: () => string;
  commands: { focus: (position: 'end') => boolean };
  state: { selection: { anchor: number } };
  view: { posAtDOM: (node: Node, offset: number) => number };
}

type TestWindow = Window & { __shitateEditor?: TestEditor };

function getHtml(page: Page): Promise<string> {
  return page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) {
      throw new Error('window.__shitateEditor is not available (dev build only)');
    }
    return editor.getHTML();
  });
}

/**
 * Waits until the editor has picked up the DOM selection.
 * ProseMirror reads clicks via the async selectionchange event, so a synthetic paste
 * dispatched right after a click would otherwise use the previous selection.
 */
async function waitForSelectionSync(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const editor = (window as TestWindow).__shitateEditor;
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode) {
      return false;
    }
    return (
      editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset) ===
      editor.state.selection.anchor
    );
  });
}

/** Cell at (row, column) of the outermost table, 0-based. */
function cell(page: Page, row: number, column: number): Locator {
  return editorBody(page)
    .locator(':scope > .tableWrapper > table > tbody > tr')
    .nth(row)
    .locator(':scope > td, :scope > th')
    .nth(column);
}

/**
 * Puts the cursor in a cell by clicking its first paragraph.
 * (Clicking the blank area of a tall merged cell can place the cursor in a neighbor cell.)
 */
async function clickCell(page: Page, row: number, column: number): Promise<void> {
  await cell(page, row, column).locator('p').first().click();
}

/** Drags from one cell to another to create a cell selection. */
async function selectCells(page: Page, from: Locator, to: Locator): Promise<void> {
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  if (!start || !end) {
    throw new Error('Cell is not visible');
  }
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 5 });
  await page.mouse.up();
}

async function insertTable(page: Page): Promise<void> {
  await editorBody(page).click();
  await page.getByRole('button', { name: '表', exact: true }).click();
  await expect(cell(page, 0, 0)).toBeVisible();
}

async function menuClick(page: Page, name: string): Promise<void> {
  await tableMenu(page).getByRole('button', { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('inserts a 3x3 table with a header row and shows the menu', async ({ page }) => {
  await insertTable(page);
  await expect(editorBody(page).locator('table > tbody > tr')).toHaveCount(3);
  await expect(editorBody(page).locator('tr').first().locator('th')).toHaveCount(3);
  await expect(tableMenu(page)).toBeVisible();
});

test('merges cells horizontally and vertically; getHTML outputs colspan/rowspan; undo restores', async ({
  page,
}) => {
  await insertTable(page);

  await selectCells(page, cell(page, 1, 0), cell(page, 1, 1));
  await menuClick(page, 'セルを結合');
  expect(await getHtml(page)).toMatch(/<td colspan="2"[^>]*>/);

  // Row 1 now has the merged cell and the third column cell.
  await selectCells(page, cell(page, 1, 1), cell(page, 2, 2));
  await menuClick(page, 'セルを結合');
  expect(await getHtml(page)).toMatch(/<td rowspan="2"[^>]*>/);

  await page.keyboard.press('ControlOrMeta+z');
  expect(await getHtml(page)).not.toMatch(/rowspan="2"/);
  expect(await getHtml(page)).toMatch(/colspan="2"/);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await getHtml(page)).not.toMatch(/colspan="2"/);
});

test('splits a merged cell and undo restores the merge', async ({ page }) => {
  await insertTable(page);
  await selectCells(page, cell(page, 1, 0), cell(page, 2, 1));
  await menuClick(page, 'セルを結合');
  expect(await getHtml(page)).toMatch(/colspan="2" rowspan="2"/);

  // Edits within 500ms are grouped into one undo step; make the split a separate step
  // as it is for a user.
  await page.waitForTimeout(600);
  await clickCell(page, 1, 0);
  await menuClick(page, 'セルを分割');
  expect(await getHtml(page)).not.toMatch(/colspan|rowspan/);

  await page.getByRole('button', { name: '元に戻す' }).click();
  expect(await getHtml(page)).toMatch(/colspan="2" rowspan="2"/);
});

test('merge is disabled for a single cell', async ({ page }) => {
  await insertTable(page);
  await clickCell(page, 1, 1);
  await expect(tableMenu(page).getByRole('button', { name: 'セルを結合' })).toBeDisabled();
});

test('adds and deletes rows and columns, toggles the header row, deletes the table', async ({
  page,
}) => {
  await insertTable(page);
  const rows = editorBody(page).locator('table > tbody > tr');

  await clickCell(page, 1, 1);
  await menuClick(page, '行を下に追加');
  await menuClick(page, '行を上に追加');
  await expect(rows).toHaveCount(5);
  await menuClick(page, '列を右に追加');
  await menuClick(page, '列を左に追加');
  await expect(rows.first().locator('th')).toHaveCount(5);

  await menuClick(page, '行を削除');
  await expect(rows).toHaveCount(4);
  await menuClick(page, '列を削除');
  await expect(rows.first().locator('th')).toHaveCount(4);

  await menuClick(page, '見出し行の切替');
  await expect(editorBody(page).locator('th')).toHaveCount(0);
  await menuClick(page, '見出し行の切替');
  await expect(rows.first().locator('th')).toHaveCount(4);

  await menuClick(page, '表を削除');
  await expect(editorBody(page).locator('table')).toHaveCount(0);
});

test.describe('cell content', () => {
  test.beforeEach(async ({ page }) => {
    await insertTable(page);
    await clickCell(page, 1, 0);
  });

  for (const { label, selector } of [
    { label: '箇条書き', selector: 'td > ul > li' },
    { label: '番号付きリスト', selector: 'td > ol > li' },
    { label: '引用', selector: 'td > blockquote > p' },
    { label: 'コードブロック', selector: 'td > pre > code' },
  ]) {
    test(`${label} can be inserted into a cell`, async ({ page }) => {
      await page.keyboard.type('セル内');
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(editorBody(page).locator(selector)).toHaveText('セル内');
    });
  }

  test('an image can be inserted into a cell', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: '画像' }).click();
    await (
      await fileChooserPromise
    ).setFiles({
      name: 'cell.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    await expect(editorBody(page).locator('td > [data-node="image"] img')).toHaveCount(1);
  });

  test('a table can be nested in a cell, with merge support', async ({ page }) => {
    await page.getByRole('button', { name: '表', exact: true }).click();
    const nestedCells = editorBody(page).locator('td table tr').nth(1).locator('td');
    await expect(nestedCells).toHaveCount(3);
    await selectCells(page, nestedCells.nth(0), nestedCells.nth(1));
    await menuClick(page, 'セルを結合');
    expect(await getHtml(page)).toMatch(/<td[^>]*>(?:(?!<\/td>).)*<table.*<td colspan="2"/s);
  });

  test('headings cannot be applied in a cell', async ({ page }) => {
    await page.keyboard.type('見出しにしない');
    const select = page.getByRole('combobox', { name: '段落の種類' });
    await expect(select.locator('option[value="h1"]')).toBeDisabled();
    await page.keyboard.press('ControlOrMeta+Alt+1');
    await expect(editorBody(page).locator('td h1, td h2, th h1')).toHaveCount(0);
    await expect(cell(page, 1, 0).locator('p')).toHaveText('見出しにしない');
  });

  test('pasted headings become paragraphs in a cell', async ({ page }) => {
    await waitForSelectionSync(page);
    await page.evaluate(() => {
      const target = document.querySelector('.doc-body');
      const data = new DataTransfer();
      data.setData(
        'text/html',
        '<h2>貼り付けた見出し</h2><ul><li><h3>リスト内の見出し</h3></li></ul>',
      );
      data.setData('text/plain', '貼り付けた見出し');
      target?.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(cell(page, 1, 0)).toContainText('貼り付けた見出し');
    await expect(cell(page, 1, 0)).toContainText('リスト内の見出し');
    await expect(editorBody(page).locator('td :is(h1, h2, h3, h4, h5, h6)')).toHaveCount(0);
    // Not wrapped in a blockquote to make the heading fit.
    await expect(editorBody(page).locator('td blockquote')).toHaveCount(0);
    await expect(cell(page, 1, 0).locator('ul > li > p')).toHaveText('リスト内の見出し');
  });

  test('pasted headings outside tables stay headings', async ({ page }) => {
    // Put the cursor in the paragraph after the table through the editor API: when the
    // table is at the top of the document, the table menu is shown below it and covers
    // that paragraph, so it cannot be clicked.
    await page.evaluate(() => {
      const editor = (window as TestWindow).__shitateEditor;
      if (!editor) throw new Error('window.__shitateEditor is not available');
      editor.commands.focus('end');
    });
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/html', '<h2>本文の見出し</h2>');
      document
        .querySelector('.doc-body')
        ?.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
        );
    });
    await expect(editorBody(page).locator(':scope > h2')).toHaveText(/^[\d.]+本文の見出し$/);
  });
});

test('headings remain available outside tables', async ({ page }) => {
  await editorBody(page).click();
  const select = page.getByRole('combobox', { name: '段落の種類' });
  await expect(select.locator('option[value="h1"]')).toBeEnabled();
});

for (const themeName of ['標準', 'シンプル']) {
  test(`hovering a column border does not change the cell height (${themeName})`, async ({
    page,
  }) => {
    await page
      .getByRole('radiogroup', { name: 'テーマ' })
      .getByRole('radio', { name: themeName })
      .check();
    await insertTable(page);
    await page.keyboard.type('セル');
    const target = cell(page, 0, 0);
    const before = await target.boundingBox();
    if (!before) throw new Error('Cell is not visible');

    // Pointing at the right border shows the column resize handle inside the cell.
    await page.mouse.move(before.x + before.width - 2, before.y + before.height / 2);
    await expect(target.locator('.column-resize-handle')).toHaveCount(1);
    expect((await target.boundingBox())?.height).toBe(before.height);
  });
}
