import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  state: {
    selection: {
      anchor: number;
      $anchor: { parent: { type: { name: string }; textContent: string } };
    };
  };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAE0lEQVR42mPQ86olCTGMahiaGgBkuJkhmHXlqgAAAABJRU5ErkJggg==';

const editorBody = (page: Page) => page.locator('.doc .doc-body');
const outline = (page: Page) => page.getByRole('navigation', { name: 'アウトライン' });
const outlineTab = (page: Page, name: string) => outline(page).getByRole('tab', { name });
const outlineItems = (page: Page) => outline(page).locator('.outline-item');
const settings = (page: Page) => page.getByRole('complementary', { name: '文書設定' });

/** Parent node type and text at the cursor. */
async function cursorBlock(page: Page): Promise<{ type: string; text: string }> {
  return page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    const parent = editor.state.selection.$anchor.parent;
    return { type: parent.type.name, text: parent.textContent };
  });
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

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate((png) => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    const text = (value: string) => [{ type: 'text', text: value }];
    const h = (level: number, value: string) => ({
      type: 'heading',
      attrs: { level },
      content: text(value),
    });
    // Long enough that the later sections start below the fold.
    const filler = Array.from({ length: 30 }, (_, i) => ({
      type: 'paragraph',
      content: text(`本文${String(i + 1)}`),
    }));
    const cell = (value: string) => ({
      type: 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: 'paragraph', content: text(value) }],
    });
    editor.commands.setContent({
      type: 'doc',
      content: [
        h(1, 'はじめに'),
        h(2, '目的'),
        ...filler,
        h(1, '画面設計'),
        {
          type: 'figure',
          content: [
            { type: 'image', attrs: { src: png, alt: '' } },
            { type: 'figcaption', content: text('画面レイアウト') },
          ],
        },
        ...filler,
        h(2, '画面一覧'),
        {
          type: 'tableFigure',
          content: [
            { type: 'tableCaption', content: text('画面の一覧') },
            { type: 'table', content: [{ type: 'tableRow', content: [cell('SC-01')] }] },
          ],
        },
        ...filler,
      ],
    });
  }, PNG);
});

test('lists the headings with their numbers and levels', async ({ page }) => {
  await expect(outlineTab(page, 'アウトライン')).toHaveAttribute('aria-selected', 'true');
  await expect(outlineItems(page)).toHaveText(['1はじめに', '1.1目的', '2画面設計', '2.1画面一覧']);
  await expect(outlineItems(page).nth(0)).toHaveClass(/outline-level-1/);
  await expect(outlineItems(page).nth(1)).toHaveClass(/outline-level-2/);
});

test('reflects heading edits immediately', async ({ page }) => {
  await clickIn(page, editorBody(page).getByRole('heading', { name: '目的' }));
  await page.keyboard.press('End');
  await page.keyboard.type('と背景');
  await expect(outlineItems(page).nth(1)).toHaveText('1.1目的と背景');

  // Turning the heading into a paragraph removes it; the H2 is then numbered as under H1 "1".
  await clickIn(page, editorBody(page).getByRole('heading', { name: 'はじめに' }));
  await page.keyboard.press('ControlOrMeta+Alt+0');
  await expect(outlineItems(page)).toHaveText(['1.1目的と背景', '2画面設計', '2.1画面一覧']);
});

test('clicking a heading scrolls to it and moves the cursor there', async ({ page }) => {
  const target = editorBody(page).getByRole('heading', { name: '画面一覧' });
  await expect(target).not.toBeInViewport();
  await outline(page).getByRole('link', { name: '2.1 画面一覧' }).click();

  await expect(target).toBeInViewport();
  expect(await cursorBlock(page)).toEqual({ type: 'heading', text: '画面一覧' });
  await expect(outline(page).getByRole('link', { name: '2.1 画面一覧' })).toHaveAttribute(
    'aria-current',
    'location',
  );
});

test('highlights the section that holds the cursor', async ({ page }) => {
  const current = outline(page).locator('[aria-current="location"]');
  await clickIn(page, editorBody(page).getByText('本文3', { exact: true }).first());
  await expect(current).toHaveText('1.1目的');
  await clickIn(page, editorBody(page).getByText('本文3', { exact: true }).nth(1));
  await expect(current).toHaveText('2画面設計');
});

test('the figures tab lists figures and tables and jumps to their captions', async ({ page }) => {
  await outlineTab(page, 'アウトライン').focus();
  await page.keyboard.press('ArrowRight');
  await expect(outlineTab(page, '図表')).toHaveAttribute('aria-selected', 'true');
  await expect(outlineTab(page, '図表')).toBeFocused();
  await expect(outlineItems(page)).toHaveText(['図1画面レイアウト', '表1画面の一覧']);

  const caption = editorBody(page).locator('.table-caption');
  await outline(page).getByRole('link', { name: '表1 画面の一覧' }).click();
  await expect(caption).toBeInViewport();
  expect(await cursorBlock(page)).toEqual({ type: 'tableCaption', text: '画面の一覧' });

  // The cursor is at the start of the caption; edits show up right away.
  await page.keyboard.type('共通の');
  await expect(outlineItems(page).nth(1)).toHaveText('表1共通の画面の一覧');
});

test('lists the cover, revision history and TOC when they exist', async ({ page }) => {
  await expect(outline(page).locator('.outline-item.is-front')).toHaveCount(0);

  await page.getByRole('button', { name: '目次', exact: true }).click();
  await settings(page).getByRole('tab', { name: '表紙' }).click();
  await settings(page).getByLabel('タイトル').fill('基本設計書');
  await settings(page).getByRole('tab', { name: '改訂履歴' }).click();
  await settings(page).getByRole('button', { name: '履歴を追加' }).click();

  const front = outline(page).locator('.outline-item.is-front');
  await expect(front).toHaveText(['表紙', '改訂履歴', '目次']);

  // The cover and revision history are previews outside the editor: scroll only.
  await clickIn(page, editorBody(page).getByText('本文30', { exact: true }).last());
  await expect(page.locator('[data-preface="cover"]')).not.toBeInViewport();
  await front.filter({ hasText: '表紙' }).click();
  await expect(page.locator('[data-preface="cover"]')).toBeInViewport();

  await front.filter({ hasText: '目次' }).click();
  await expect(editorBody(page).locator('.doc-toc')).toBeInViewport();
  await expect(editorBody(page).locator('.doc-toc')).toHaveClass(/ProseMirror-selectednode/);
});
