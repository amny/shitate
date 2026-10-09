import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { FrameLocator, Page } from '@playwright/test';

// 1x1 transparent PNG
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const COPYRIGHT = '© 2026 "サンプル"';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
}
interface PdfRequest {
  html: string;
  styleSheets: string[];
  title: string;
}
interface PdfFrameEvent {
  type: string;
  pageCount?: number;
  message?: string;
}
type TestWindow = Window & {
  __shitateEditor?: TestEditor;
  __shitatePdfRequest?: PdfRequest;
  shitatePdf?: {
    render: (request: PdfRequest, onEvent: (event: PdfFrameEvent) => void) => void;
  };
};

const panel = (page: Page) => page.getByRole('complementary', { name: '文書設定' });
const preview = (page: Page) => page.getByRole('dialog', { name: 'PDFプレビュー' });
const frame = (page: Page): FrameLocator => page.frameLocator('iframe[title="PDFのページ"]');
const pages = (page: Page) => frame(page).locator('[data-vivliostyle-page-container]');
const marginBox = (page: Page, index: number, position: string) =>
  pages(page).nth(index).locator(`[data-vivliostyle-page-margin-box="${position}"]`);

/** spec-full.json with a cover, a logo and a copyright. */
async function prepareDocument(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const doc: unknown = await (await fetch('/fixtures/spec-full.json')).json();
    (window as TestWindow).__shitateEditor?.commands.setContent(doc);
  });
  await panel(page).getByRole('tab', { name: '表紙' }).click();
  await panel(page).getByLabel('タイトル').fill('基本設計書');
  await panel(page).getByLabel('会社名').fill('株式会社サンプル');
  await panel(page).getByRole('tab', { name: 'テーマ' }).click();
  await panel(page).getByLabel('この文書だけ上書きする').check();
  await panel(page).getByLabel('Copyright').fill(COPYRIGHT);
  const chooser = page.waitForEvent('filechooser');
  await panel(page)
    .getByRole('button', { name: /画像を選択/ })
    .click();
  await (
    await chooser
  ).setFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });
}

/** Opens the preview and waits for the layout; returns the page count. */
async function openPreview(page: Page): Promise<number> {
  await page.getByRole('button', { name: 'PDFプレビュー' }).click();
  const counter = preview(page).getByText(/^\d+ \/ 全 \d+ ページ$/);
  await expect(counter).toBeVisible({ timeout: 30_000 });
  const match = /全 (\d+) ページ/.exec((await counter.textContent()) ?? '');
  return Number(match?.[1]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.doc .doc-body')).toBeVisible();
  await prepareDocument(page);
});

test('lays out the document with a cover, TOC page numbers, header, footer and running heads', async ({
  page,
}) => {
  const count = await openPreview(page);
  expect(count).toBeGreaterThanOrEqual(4);
  await expect(pages(page)).toHaveCount(count);

  // Cover: no header / footer.
  await expect(pages(page).nth(0).locator('.cover-title')).toHaveText('基本設計書');
  // (`content: none` boxes are not generated at all.)
  await expect(
    pages(page).nth(0).locator('[data-vivliostyle-page-margin-box]').filter({ hasText: /\S/ }),
  ).toHaveCount(0);
  const coverLogos = await pages(page)
    .nth(0)
    .locator('[data-vivliostyle-page-margin-box]')
    .evaluateAll((boxes: Element[]) =>
      boxes.filter((box) => getComputedStyle(box).backgroundImage !== 'none'),
    );
  expect(coverLogos).toHaveLength(0);

  // Other pages: logo, copyright and page number.
  for (let index = 1; index < count; index++) {
    await expect(marginBox(page, index, 'bottom-right')).toHaveText(
      `${String(index + 1)} / ${String(count)}`,
    );
    await expect(marginBox(page, index, 'bottom-left')).toHaveText(COPYRIGHT);
    // The logo is drawn as a background scaled to 8mm high (not at its own size).
    const logo = await marginBox(page, index, 'top-left').evaluate((box: HTMLElement) => {
      const style = getComputedStyle(box);
      return { image: style.backgroundImage, size: style.backgroundSize };
    });
    expect(logo.image).toContain(`data:image/png;base64,${PNG_BASE64}`);
    expect(logo.size).toMatch(/^auto \d+(\.\d+)?px$/);
  }

  // TOC: each entry ends with the page its heading is on.
  const tocEntries = await frame(page)
    .locator('.doc-toc a.toc-item')
    .evaluateAll((items: Element[]) =>
      items.map((item) => {
        const id = item.getAttribute('href')?.slice(1) ?? '';
        const target = item.ownerDocument.getElementById(id);
        const container = target?.closest('[data-vivliostyle-page-container]');
        return {
          text: item.textContent.replace(/\s+/g, ''),
          targetPage: Number(container?.getAttribute('data-vivliostyle-page-index')) + 1,
        };
      }),
    );
  expect(tocEntries.length).toBeGreaterThan(5);
  for (const entry of tocEntries) {
    expect(entry.text.endsWith(String(entry.targetPage)), JSON.stringify(entry)).toBe(true);
  }

  // Running head: the current chapter, with a space after its number.
  const chapterPages = await pages(page).evaluateAll((containers: Element[]) =>
    containers.map((container) => ({
      head:
        container.querySelector('[data-vivliostyle-page-margin-box="top-right"]')?.textContent ??
        '',
      chapters: [...container.querySelectorAll('.doc-body h1')].map((h) =>
        h.textContent.replace(/\s+/g, ' ').trim(),
      ),
    })),
  );
  const withChapter = chapterPages.find((p) => p.chapters.length > 0);
  expect(withChapter?.head.trim()).toBe(withChapter?.chapters[0]);
  expect(withChapter?.head).toMatch(/^\d+ \S/);
});

test('turns pages and switches the view', async ({ page }) => {
  const count = await openPreview(page);
  await expect(preview(page).getByText(`1 / 全 ${String(count)} ページ`)).toBeVisible();
  await expect(preview(page).getByRole('button', { name: '前のページ' })).toBeDisabled();

  await preview(page).getByRole('button', { name: '次のページ' }).click();
  await expect(preview(page).getByText(`2 / 全 ${String(count)} ページ`)).toBeVisible();
  await expect(pages(page).nth(1)).toBeVisible();
  await expect(pages(page).nth(0)).toBeHidden();

  await page.keyboard.press('ArrowRight');
  await expect(preview(page).getByText(`3 / 全 ${String(count)} ページ`)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(preview(page).getByText(`2 / 全 ${String(count)} ページ`)).toBeVisible();

  await preview(page).getByLabel('表示').selectOption({ label: '見開き（全体）' });
  await expect(frame(page).locator('[data-vivliostyle-page-container]:visible')).toHaveCount(2);

  await preview(page).getByRole('button', { name: '編集に戻る' }).click();
  await expect(preview(page)).toHaveCount(0);
  await expect(page.locator('.doc .doc-body h1').first()).toBeVisible();
});

test('the printed PDF has the same pages and page sizes as the preview', async ({
  page,
  context,
}) => {
  const count = await openPreview(page);
  const request = await page.evaluate(() => (window as TestWindow).__shitatePdfRequest);
  if (!request) throw new Error('No PDF request (dev build only)');

  // Lay out the same request as a top-level page, then print it like the browser does.
  const printPage = await context.newPage();
  await printPage.goto('/pdf-preview.html');
  const result = await printPage.evaluate(
    (req) =>
      new Promise<PdfFrameEvent>((resolve) => {
        (window as TestWindow).shitatePdf?.render(req, (event) => {
          if (event.type === 'done' || event.type === 'error') resolve(event);
        });
      }),
    request,
  );
  expect(result).toMatchObject({ type: 'done', pageCount: count });
  const previewSizes = await printPage
    .locator('[data-vivliostyle-page-container]')
    .evaluateAll((containers: HTMLElement[]) =>
      containers.map((c) => {
        const mm = (px: string) => Math.round((parseFloat(px) * 25.4) / 96);
        return `${String(mm(c.style.width))}x${String(mm(c.style.height))}mm`;
      }),
    );

  const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
  const pdfSizes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/g)].map(
    (m) => {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = m[1].trim().split(/\s+/).map(Number);
      return `${String(Math.round(((x1 - x0) / 72) * 25.4))}x${String(Math.round(((y1 - y0) / 72) * 25.4))}mm`;
    },
  );
  expect(pdfSizes).toEqual(previewSizes);
  // spec-full.json has a landscape table: portrait A4 and landscape A4 are both present.
  expect(new Set(pdfSizes)).toEqual(new Set(['210x297mm', '297x210mm']));
  await printPage.close();
});

test('the delivered HTML is unchanged by the PDF preparation', async ({ page }) => {
  await openPreview(page);
  const request = await page.evaluate(() => (window as TestWindow).__shitatePdfRequest);
  await preview(page).getByRole('button', { name: '編集に戻る' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const exported = readFileSync(await (await downloadPromise).path(), 'utf8');
  // The space after heading numbers is added only for the PDF.
  expect(exported).toBe(request?.html);
  expect(exported).toMatch(/<span class="heading-number">1<\/span>はじめに/);
});
