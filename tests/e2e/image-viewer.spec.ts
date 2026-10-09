import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

/**
 * Sets a document with:
 * 0. a 400x200 figure image resized to 200x100 (caption "構成図"),
 * 1. a 100x50 image shown at its natural size,
 * 2. a 3000x1500 image shrunk to the page width by the theme.
 */
async function setImages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const png = (width: number, height: number): string => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('2d context is not available');
      context.fillStyle = '#3388cc';
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    };
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'figure',
          content: [
            { type: 'image', attrs: { src: png(400, 200), alt: '構成', width: 200, height: 100 } },
            { type: 'figcaption', content: [{ type: 'text', text: '構成図' }] },
          ],
        },
        { type: 'image', attrs: { src: png(100, 50) } },
        { type: 'image', attrs: { src: png(3000, 1500) } },
      ],
    });
  });
  await expect(editorBody(page).locator('img')).toHaveCount(3);
}

/** Exports the document and opens the HTML in a new page without network access. */
async function openExported(page: Page): Promise<Page> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const path = await (await downloadPromise).path();
  const viewer = await page.context().newPage();
  await viewer.route('**/*', (route) => route.abort());
  await viewer.setContent(readFileSync(path, 'utf8'));
  return viewer;
}

let exported: Page;

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await setImages(page);
  exported = await openExported(page);
});

const images = (page: Page) => page.locator('.doc-body img');
const dialog = (page: Page) => page.getByRole('dialog', { name: '画像の拡大表示' });

test('a resized figure image opens at its natural size with the caption', async () => {
  const image = images(exported).first();
  await expect(image).toHaveCSS('cursor', 'zoom-in');
  await image.click();

  await expect(dialog(exported)).toBeVisible();
  const shown = dialog(exported).locator('img');
  await expect(shown).toHaveAttribute('alt', '構成');
  const size = await shown.evaluate((img: HTMLImageElement) => [
    img.getBoundingClientRect().width,
    img.getBoundingClientRect().height,
  ]);
  expect(size).toEqual([400, 200]);
  await expect(dialog(exported).locator('figcaption')).toHaveText('図1構成図');
  await expect(dialog(exported).locator('figcaption .caption-number')).toHaveText('図1');

  await exported.keyboard.press('Escape');
  await expect(dialog(exported)).toBeHidden();
});

test('the viewer closes with the close button and with a click on the backdrop', async () => {
  await images(exported).first().click();
  await dialog(exported).getByRole('button', { name: '閉じる' }).click();
  await expect(dialog(exported)).toBeHidden();

  await images(exported).first().click();
  await expect(dialog(exported)).toBeVisible();
  await exported.mouse.click(5, (exported.viewportSize()?.height ?? 600) - 5);
  await expect(dialog(exported)).toBeHidden();
});

test('an image shown at its natural size does not open the viewer', async () => {
  const image = images(exported).nth(1);
  await expect(image).not.toHaveCSS('cursor', 'zoom-in');
  await image.click();
  await expect(dialog(exported)).toBeHidden();
});

/** The rectangle of an element in the viewport. */
function rectOf(
  locator: Locator,
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return locator.evaluate((el) => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  });
}

/** Checks that the image and the caption are inside the window, with the image's aspect ratio. */
async function expectFitsWindow(page: Page, ratio: number): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport size');
  const image = await rectOf(dialog(page).locator('img'));
  const caption = await rectOf(dialog(page).locator('figcaption'));
  for (const rect of [image, caption]) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewport.width);
    expect(rect.bottom).toBeLessThanOrEqual(viewport.height);
  }
  const width = image.right - image.left;
  const height = image.bottom - image.top;
  expect(Math.abs(width / height - ratio)).toBeLessThan(0.02);
  const scrollable = await dialog(page).evaluate(
    (el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
  );
  expect(scrollable).toBe(false);
}

test('an image larger than the window is scaled down to fit it', async () => {
  await images(exported).nth(2).click();
  await expect(dialog(exported)).toBeVisible();
  await expectFitsWindow(exported, 2);
  const shownWidth = await dialog(exported)
    .locator('img')
    .evaluate((img) => img.getBoundingClientRect().width);
  expect(shownWidth).toBeLessThan(3000);
  // No caption outside a figure.
  await expect(dialog(exported).locator('figcaption')).toBeEmpty();
});

test('a figure fits a small window with its caption, and refits when the window changes', async () => {
  await exported.setViewportSize({ width: 360, height: 260 });
  await images(exported).first().click();
  await expect(dialog(exported)).toBeVisible();
  await expect(dialog(exported).locator('figcaption')).toHaveText('図1構成図');
  await expectFitsWindow(exported, 2);

  // Back to a large window: up to the natural size, not beyond it.
  await exported.setViewportSize({ width: 1280, height: 720 });
  await expect
    .poll(() =>
      dialog(exported)
        .locator('img')
        .evaluate((img) => img.getBoundingClientRect().width),
    )
    .toBe(400);
});

test('a reduced image can be opened from the keyboard', async () => {
  await images(exported).first().focus();
  await exported.keyboard.press('Enter');
  await expect(dialog(exported)).toBeVisible();
});
