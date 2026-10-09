import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mO4WR6OFTEMLQkAcq9pwfhQlf4AAAAASUVORK5CYII=';

interface TestEditor {
  commands: {
    setContent: (content: unknown) => boolean;
    insertContentAt: (position: number, content: unknown) => boolean;
    setTextSelection: (position: number) => boolean;
    focus: () => boolean;
  };
  state: { selection: { anchor: number } };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

const captionButton = (page: Page) => page.getByRole('button', { name: 'キャプション' });

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

/** Inserts an image through the toolbar and waits until it is in the document (read async). */
async function insertImage(page: Page): Promise<void> {
  const images = editorBody(page).locator('img');
  const before = await images.count();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像' }).click();
  await (
    await fileChooserPromise
  ).setFiles({
    name: 'figure.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
  await expect(images).toHaveCount(before + 1);
}

/** Clicks the n-th image (selects it as a node) and adds a caption with the given text. */
async function captionImage(page: Page, index: number, caption: string): Promise<void> {
  await editorBody(page).locator('img').nth(index).click();
  await expect(captionButton(page)).toBeEnabled();
  await captionButton(page).click();
  await page.keyboard.type(caption);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('an image gets a numbered caption, and removing it keeps the text', async ({ page }) => {
  await editorBody(page).click();
  await insertImage(page);
  await editorBody(page).locator('img').click();
  await captionButton(page).click();

  const caption = editorBody(page).locator('figure > figcaption');
  await expect(caption).toHaveAttribute('data-placeholder', 'キャプションを入力');
  await page.keyboard.type('構成図');
  await expect(caption).toHaveText('図1構成図');
  await expect(caption.locator('.caption-number')).toHaveAttribute('contenteditable', 'false');
  await expect(captionButton(page)).toHaveAttribute('aria-pressed', 'true');

  await captionButton(page).click();
  await expect(editorBody(page).locator('figure')).toHaveCount(0);
  await expect(editorBody(page).locator(':scope > [data-node="image"] + p')).toHaveText('構成図');
});

test('figure numbers follow the order of the figures', async ({ page }) => {
  await editorBody(page).click();
  await insertImage(page);
  await captionImage(page, 0, '後の図');
  await expect(editorBody(page).locator('figcaption')).toHaveText(['図1後の図']);

  // Insert another figure before it: the existing one becomes 図2.
  // Put the cursor in a new paragraph at the top of the document.
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    editor.commands.insertContentAt(0, { type: 'paragraph' });
    editor.commands.setTextSelection(1);
    editor.commands.focus();
  });
  await insertImage(page);
  await captionImage(page, 0, '前の図');
  await expect(editorBody(page).locator('figcaption')).toHaveText(['図1前の図', '図2後の図']);

  // Delete the first figure's image: the figure goes (its caption stays as text) and
  // the other figure becomes 図1 again.
  await editorBody(page).locator('img').first().click();
  await page.keyboard.press('Delete');
  await expect(editorBody(page).locator('figcaption')).toHaveText(['図1後の図']);
  await expect(editorBody(page).locator(':scope > p').filter({ hasText: '前の図' })).toHaveCount(1);
});

test('a table gets a numbered caption above it', async ({ page }) => {
  await editorBody(page).click();
  await page.getByRole('button', { name: '表', exact: true }).click();
  await expect(captionButton(page)).toBeEnabled();
  await captionButton(page).click();
  await page.keyboard.type('画面一覧');

  const tableFigure = editorBody(page).locator('.table-figure');
  await expect(tableFigure.locator(':scope > .table-caption')).toHaveText('表1画面一覧');
  await expect(tableFigure.locator(':scope > .tableWrapper table, :scope > table')).toHaveCount(1);

  // Removing the caption keeps its text above the table.
  await clickIn(page, editorBody(page).locator('td p').first());
  await captionButton(page).click();
  await expect(tableFigure).toHaveCount(0);
  await expect(editorBody(page).locator(':scope > p').first()).toHaveText('画面一覧');
});

test('images and tables inside table cells cannot get captions', async ({ page }) => {
  await editorBody(page).click();
  await page.getByRole('button', { name: '表', exact: true }).click();
  await insertImage(page);
  await editorBody(page).locator(':is(td, th) img').click();
  await expect(captionButton(page)).toBeDisabled();

  await clickIn(page, editorBody(page).locator('td p').last());
  await page.getByRole('button', { name: '表', exact: true }).click();
  await clickIn(page, editorBody(page).locator('td table td p').first());
  await expect(captionButton(page)).toBeDisabled();
  await expect(editorBody(page).locator('.caption-number')).toHaveCount(0);
});

test('captions and numbers survive export and reopening', async ({ page }) => {
  // Open the fixture with figures and captioned tables.
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await fileChooserPromise
  ).setFiles({
    name: 'spec-full.json',
    mimeType: 'application/json',
    buffer: readFileSync('fixtures/spec-full.json'),
  });
  await expect(editorBody(page).locator('figcaption')).toHaveText(['図1共通レイアウト', '図2ER図']);
  await expect(editorBody(page).locator('.table-caption')).toHaveText([
    '表1画面一覧',
    '表2桁数チェック',
  ]);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const download = await downloadPromise;
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('<figcaption><span class="caption-number">図2</span>ER図</figcaption>');
  expect(html).toMatch(
    /<div class="table-figure is-landscape" id="t-spec0002"><div class="table-caption"><span class="caption-number">表2<\/span>桁数チェック<\/div>/,
  );

  const dialogPromise = page.waitForEvent('dialog');
  const reopenChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await reopenChooser
  ).setFiles({
    name: download.suggestedFilename(),
    mimeType: 'text/html',
    buffer: Buffer.from(html),
  });
  await (await dialogPromise).accept();
  await expect(page.getByRole('banner')).toContainText(download.suggestedFilename());
  await expect(editorBody(page).locator('figcaption')).toHaveText(['図1共通レイアウト', '図2ER図']);
  await expect(editorBody(page).locator('.table-caption')).toHaveText([
    '表1画面一覧',
    '表2桁数チェック',
  ]);
});
