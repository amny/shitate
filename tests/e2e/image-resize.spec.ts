import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface ImageAttrs {
  width: number | null;
  height: number | null;
}
interface JsonNode {
  type?: string;
  attrs?: ImageAttrs;
  content?: JsonNode[];
}
interface TestEditor {
  getJSON: () => JsonNode;
  commands: { setContent: (content: unknown) => boolean };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

/** Sets a document with a body image, a figure and an image in a cell (200x100 px each). */
async function setImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2d context is not available');
    context.fillStyle = '#3388cc';
    context.fillRect(0, 0, 200, 100);
    const image = { type: 'image', attrs: { src: canvas.toDataURL('image/png') } };
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    editor.commands.setContent({
      type: 'doc',
      content: [
        image,
        {
          type: 'figure',
          content: [image, { type: 'figcaption', content: [{ type: 'text', text: '構成図' }] }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [image] },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    });
  });
  await expect(editorBody(page).locator('img')).toHaveCount(3);
}

/** Sizes of the images in the document JSON, in document order. */
async function storedSizes(page: Page): Promise<[number | null, number | null][]> {
  return page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    const sizes: [number | null, number | null][] = [];
    const collect = (node: JsonNode): void => {
      if (node.type === 'image' && node.attrs) sizes.push([node.attrs.width, node.attrs.height]);
      node.content?.forEach(collect);
    };
    collect(editor.getJSON());
    return sizes;
  });
}

async function box(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const result = await locator.boundingBox();
  if (!result) throw new Error('element is not visible');
  return result;
}

/** Selects the n-th image and drags one of its corner handles horizontally by dx. */
async function dragHandle(page: Page, index: number, handle: string, dx: number): Promise<void> {
  const image = editorBody(page).locator('img').nth(index);
  await image.click();
  const container = editorBody(page).locator('[data-node="image"]').nth(index);
  const target = container.locator(`[data-resize-handle="${handle}"]`);
  await expect(target).toBeVisible();
  const { x, y, width, height } = await box(target);
  await page.mouse.move(x + width / 2, y + height / 2);
  await page.mouse.down();
  await page.mouse.move(x + width / 2 + dx, y + height / 2, { steps: 5 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await setImages(page);
});

test('dragging a corner handle resizes the image and keeps the aspect ratio', async ({ page }) => {
  await dragHandle(page, 0, 'bottom-right', -80);
  await expect
    .poll(() => storedSizes(page))
    .toEqual([
      [120, 60],
      [null, null],
      [null, null],
    ]);
  const image = await box(editorBody(page).locator('img').first());
  expect(Math.round(image.width)).toBe(120);
  expect(Math.round(image.height)).toBe(60);

  // The left handle grows the image when dragged to the left.
  await dragHandle(page, 0, 'bottom-left', -40);
  await expect.poll(async () => (await storedSizes(page))[0]).toEqual([160, 80]);
});

test('a resized figure image stays centered', async ({ page }) => {
  await dragHandle(page, 1, 'bottom-right', -100);
  await expect.poll(async () => (await storedSizes(page))[1]).toEqual([100, 50]);
  const figure = await box(editorBody(page).locator('figure'));
  const image = await box(editorBody(page).locator('figure img'));
  expect(Math.abs(image.x + image.width / 2 - (figure.x + figure.width / 2))).toBeLessThan(2);
});

test('an image in a cell can be resized', async ({ page }) => {
  await dragHandle(page, 2, 'bottom-right', -50);
  await expect.poll(async () => (await storedSizes(page))[2]).toEqual([150, 75]);
});

test('an image cannot be made wider than the page', async ({ page }) => {
  const pageWidth = (await box(editorBody(page))).width;
  await dragHandle(page, 0, 'bottom-right', 2000);
  await expect.poll(async () => (await storedSizes(page))[0]?.[0]).toBeGreaterThan(200);
  const [width, height] = (await storedSizes(page))[0] ?? [];
  expect(width).toBeLessThanOrEqual(Math.ceil(pageWidth));
  expect(Math.abs((width ?? 0) / 2 - (height ?? 0))).toBeLessThanOrEqual(1);
});
