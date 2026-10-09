import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  state: {
    selection: {
      anchor: number;
      $anchor: { parent: { type: { name: string }; textContent: string } };
    };
    doc: { firstChild: { type: { name: string } } | null };
  };
  view: { posAtDOM: (node: Node, offset: number) => number };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

const toc = (page: Page) => editorBody(page).locator('.doc-toc');
const tocItems = (page: Page) => toc(page).locator('.toc-item');
const tocButton = (page: Page) => page.getByRole('button', { name: '目次' });
const depthSelect = (page: Page) => page.getByRole('combobox', { name: '目次に載せる深さ' });

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
      content: [
        h(1, 'はじめに'),
        h(2, '目的'),
        h(3, '前提'),
        h(4, '用語'),
        h(1, '設計'),
        { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
      ],
    });
  });
});

test('the toolbar button inserts the TOC at the start and removes it', async ({ page }) => {
  // Even with the cursor at the end of the document.
  await clickIn(page, editorBody(page).locator('p').last());
  await expect(tocButton(page)).toHaveAttribute('aria-pressed', 'false');
  await tocButton(page).click();

  await expect(tocButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(editorBody(page).locator('> *').first()).toHaveClass(/doc-toc/);
  await expect(toc(page).locator('.toc-title')).toHaveText('目次');
  await expect(tocItems(page)).toHaveText(['1はじめに', '1.1目的', '1.1.1前提', '2設計']);

  await tocButton(page).click();
  await expect(toc(page)).toHaveCount(0);
  await expect(tocButton(page)).toHaveAttribute('aria-pressed', 'false');
});

test('editing headings updates the TOC immediately', async ({ page }) => {
  await tocButton(page).click();
  await clickIn(page, editorBody(page).locator('h2'));
  await page.keyboard.type('と背景');
  await expect(tocItems(page).nth(1)).toHaveText('1.1目的と背景');

  await page.getByRole('combobox', { name: '段落の種類' }).selectOption('h1');
  await expect(tocItems(page)).toHaveText(['1はじめに', '2目的と背景', '2.1.1前提', '3設計']);

  await page.getByRole('button', { name: '見出し番号' }).click();
  await expect(tocItems(page)).toHaveText(['1はじめに', '目的と背景', '前提', '2設計']);
});

test('the depth setting changes how deep the TOC goes', async ({ page }) => {
  await tocButton(page).click();
  await expect(depthSelect(page)).toHaveValue('3');
  await depthSelect(page).selectOption('1');
  await expect(tocItems(page)).toHaveText(['1はじめに', '2設計']);
  await depthSelect(page).selectOption('4');
  await expect(tocItems(page)).toHaveText([
    '1はじめに',
    '1.1目的',
    '1.1.1前提',
    '1.1.1.1用語',
    '2設計',
  ]);
});

test('clicking an entry moves the cursor to the heading', async ({ page }) => {
  await tocButton(page).click();
  await tocItems(page).filter({ hasText: '設計' }).click();
  await page.waitForFunction(() => {
    const parent = (window as TestWindow).__shitateEditor?.state.selection.$anchor.parent;
    return parent?.type.name === 'heading' && parent.textContent === '設計';
  });
  await expect(editorBody(page).locator('h1').last()).toBeInViewport();
});

test('the exported HTML has a linked TOC before the body, with the chosen depth', async ({
  page,
}) => {
  await tocButton(page).click();
  await depthSelect(page).selectOption('2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const html = readFileSync(await (await downloadPromise).path(), 'utf8');

  const exported = await page.evaluate((source) => {
    const dom = new DOMParser().parseFromString(source, 'text/html');
    const nav = dom.querySelector('.doc > nav.doc-toc');
    return {
      next: nav?.nextElementSibling?.tagName,
      items: [...(nav?.querySelectorAll('a.toc-item') ?? [])].map((a) => ({
        text: a.textContent,
        targetExists: dom.getElementById(a.getAttribute('href')?.slice(1) ?? '') !== null,
      })),
    };
  }, html);
  expect(exported.next).toBe('MAIN');
  expect(exported.items.map((i) => i.text)).toEqual(['1はじめに', '1.1目的', '2設計']);
  expect(exported.items.every((i) => i.targetExists)).toBe(true);
});

test('the depth is restored with the document', async ({ page }) => {
  await tocButton(page).click();
  await depthSelect(page).selectOption('1');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const path = await (await downloadPromise).path();

  await depthSelect(page).selectOption('5');
  // Opening a file over a non-empty document asks for confirmation.
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '開く' }).click();
  await (
    await chooser
  ).setFiles({
    name: 'exported.html',
    mimeType: 'text/html',
    buffer: readFileSync(path),
  });
  await expect(depthSelect(page)).toHaveValue('1');
  await expect(tocItems(page)).toHaveText(['1はじめに', '2設計']);
});
