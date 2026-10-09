import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** Subset of the editor exposed as window.__shitateEditor (src/editor/devHook.ts, dev only). */
interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  state: { selection: { anchor: number; head: number } };
  view: { posAtDOM: (node: Node, offset: number) => number };
  getJSON: () => {
    content?: { type: string; attrs?: Record<string, unknown>; content?: { text?: string }[] }[];
  };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

async function headingIds(page: Page): Promise<{ text: string; id: unknown }[]> {
  return page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    return (editor.getJSON().content ?? [])
      .filter((node) => node.type === 'heading')
      .map((node) => ({
        text: (node.content ?? []).map((c) => c.text ?? '').join(''),
        id: node.attrs?.['id'],
      }));
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available (dev build only)');
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '元の見出し' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
      ],
    });
  });
});

test('a heading gets a stable id when it is created', async ({ page }) => {
  const [heading] = await headingIds(page);
  expect(heading.id).toMatch(/^h-[0-9a-z]{8}$/);
});

/**
 * Copies the selection through ProseMirror's own copy handler and returns the clipboard data.
 * (Keyboard copy/paste is not connected to a clipboard in headless Chromium.)
 */
async function copySelection(page: Page): Promise<{ html: string; text: string }> {
  return page.evaluate(() => {
    const data = new DataTransfer();
    document
      .querySelector('.doc-body')
      ?.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    return { html: data.getData('text/html'), text: data.getData('text/plain') };
  });
}

async function paste(page: Page, clip: { html: string; text: string }): Promise<void> {
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
}

/** Selects the whole document (so the heading node is copied as a block) and copies it. */
async function copyAll(page: Page): Promise<{ html: string; text: string }> {
  await editorBody(page).locator('p').last().click();
  await page.keyboard.press('ControlOrMeta+a');
  const clip = await copySelection(page);
  expect(clip.html).toContain('元の見出し');
  return clip;
}

/**
 * Puts the cursor in a paragraph and waits until the editor has picked up the DOM selection
 * (ProseMirror reads clicks via the async selectionchange event).
 */
async function placeCursor(page: Page, paragraph: Locator): Promise<void> {
  await paragraph.click();
  await page.waitForFunction(() => {
    const editor = (window as TestWindow).__shitateEditor;
    const selection = window.getSelection();
    if (!editor || !selection?.anchorNode) return false;
    const { anchor, head } = editor.state.selection;
    return (
      anchor === head &&
      editor.view.posAtDOM(selection.anchorNode, selection.anchorOffset) === anchor
    );
  });
}

test('copy-pasting a heading before the original keeps the original id', async ({ page }) => {
  const [original] = await headingIds(page);

  const clip = await copyAll(page);
  await placeCursor(page, editorBody(page).locator('p').first());
  await paste(page, clip);

  await expect(editorBody(page).locator('h2')).toHaveCount(2);
  const [pasted, kept] = await headingIds(page);
  expect(kept).toEqual(original);
  expect(pasted.text).toBe('元の見出し');
  expect(pasted.id).toMatch(/^h-[0-9a-z]{8}$/);
  expect(pasted.id).not.toBe(original.id);
});

test('copy-pasting a heading after the original keeps the original id', async ({ page }) => {
  const [original] = await headingIds(page);

  const clip = await copyAll(page);
  await placeCursor(page, editorBody(page).locator('p').last());
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await paste(page, clip);

  await expect(editorBody(page).locator('h2')).toHaveCount(2);
  const [kept, pasted] = await headingIds(page);
  expect(kept).toEqual(original);
  expect(pasted.id).not.toBe(original.id);
  expect(pasted.id).toMatch(/^h-[0-9a-z]{8}$/);
});
