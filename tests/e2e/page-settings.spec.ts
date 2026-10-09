import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

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
const frame = (page: Page) => page.frameLocator('iframe[title="PDFのページ"]');
const editorBody = (page: Page) => page.locator('.doc .doc-body');
/** Clicks the visible segment of the orientation control (the radio itself is hidden). */
async function chooseOrientation(page: Page, name: '縦' | '横'): Promise<void> {
  await panel(page).locator('.settings-segment', { hasText: name }).click();
  await expect(panel(page).getByRole('radio', { name })).toBeChecked();
}

const landscapeButton = (page: Page) =>
  page.getByRole('toolbar', { name: '表の操作' }).getByRole('button', { name: 'PDFで横向き' });

const cell = (text: string) => ({
  type: 'tableCell',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const table = (text: string) => ({
  type: 'table',
  content: [{ type: 'tableRow', content: [cell(text), cell('値')] }],
});
const tableFigure = (caption: string, text: string) => ({
  type: 'tableFigure',
  content: [{ type: 'tableCaption', content: [{ type: 'text', text: caption }] }, table(text)],
});
const heading = (text: string) => ({
  type: 'heading',
  attrs: { level: 1 },
  content: [{ type: 'text', text }],
});

/** Sizes (mm) of every page, from the preview's page containers. */
async function previewPageSizes(page: Page): Promise<string[]> {
  return frame(page)
    .locator('[data-vivliostyle-page-container]')
    .evaluateAll((containers: HTMLElement[]) =>
      containers.map((c) => {
        const mm = (px: string) => Math.round((parseFloat(px) * 25.4) / 96);
        return `${String(mm(c.style.width))}x${String(mm(c.style.height))}mm`;
      }),
    );
}

async function openPreview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'PDFプレビュー' }).click();
  await expect(preview(page).getByText(/^\d+ \/ 全 \d+ ページ$/)).toBeVisible({
    timeout: 30_000,
  });
}

async function closePreview(page: Page): Promise<void> {
  await preview(page).getByRole('button', { name: '編集に戻る' }).click();
  await expect(preview(page)).toHaveCount(0);
}

/** Prints the last preview request like the browser does, and returns the PDF page sizes. */
async function printedPageSizes(page: Page, context: BrowserContext): Promise<string[]> {
  const request = await page.evaluate(() => (window as TestWindow).__shitatePdfRequest);
  if (!request) throw new Error('No PDF request (dev build only)');
  const printPage = await context.newPage();
  await printPage.goto('/pdf-preview.html');
  await printPage.evaluate(
    (req) =>
      new Promise<void>((resolve, reject) => {
        (window as TestWindow).shitatePdf?.render(req, (event) => {
          if (event.type === 'done') resolve();
          if (event.type === 'error') reject(new Error('layout failed'));
        });
      }),
    request,
  );
  const pdf = await printPage.pdf({ preferCSSPageSize: true });
  await printPage.close();
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/g)].map((m) => {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = m[1].trim().split(/\s+/).map(Number);
    return `${String(Math.round(((x1 - x0) / 72) * 25.4))}x${String(Math.round(((y1 - y0) / 72) * 25.4))}mm`;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
  await page.evaluate(
    (content) => {
      (window as TestWindow).__shitateEditor?.commands.setContent({ type: 'doc', content });
    },
    [
      heading('概要'),
      { type: 'paragraph', content: [{ type: 'text', text: '本文' }] },
      tableFigure('縦の表', '縦'),
      heading('一覧'),
      tableFigure('横にする表', '横'),
      table('キャプションなし'),
    ],
  );
});

test('A3 landscape and a custom size change the preview and the printed PDF', async ({
  page,
  context,
}) => {
  await panel(page).getByLabel('サイズ', { exact: true }).selectOption('A3');
  await chooseOrientation(page, '横');
  await openPreview(page);
  const a3 = await previewPageSizes(page);
  expect(new Set(a3)).toEqual(new Set(['420x297mm']));
  expect(await printedPageSizes(page, context)).toEqual(a3);
  await closePreview(page);

  await panel(page).getByLabel('サイズ', { exact: true }).selectOption('custom');
  await chooseOrientation(page, '縦');
  await panel(page).getByLabel('幅（mm）').fill('182');
  await panel(page).getByLabel('高さ（mm）').fill('257');
  await openPreview(page);
  const custom = await previewPageSizes(page);
  expect(new Set(custom)).toEqual(new Set(['182x257mm']));
  expect(await printedPageSizes(page, context)).toEqual(custom);
});

test('invalid custom sizes are not saved', async ({ page }) => {
  await panel(page).getByLabel('サイズ', { exact: true }).selectOption('custom');
  const width = panel(page).getByLabel('幅（mm）');
  await width.fill('99');
  await expect(panel(page).getByRole('alert')).toHaveText('100〜1000mmで入力してください');
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await width.fill('');
  await expect(panel(page).getByRole('alert')).toHaveText('数値で入力してください');

  // The last valid value (the default 210mm) is what the PDF uses.
  await openPreview(page);
  expect(new Set(await previewPageSizes(page))).toEqual(new Set(['210x297mm']));
});

test('the base font size changes the editor and the PDF', async ({ page }) => {
  const bodyFontPx = () =>
    editorBody(page)
      .locator('p')
      .first()
      .evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  const pt = (value: number) => (value * 96) / 72;

  expect(await bodyFontPx()).toBeCloseTo(pt(10.5), 1);
  await panel(page).getByLabel('基準文字サイズ').selectOption('12');
  await expect.poll(bodyFontPx).toBeCloseTo(pt(12), 1);

  await openPreview(page);
  const pdfFontPx = await frame(page)
    .locator('.doc-body p')
    .first()
    .evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  expect(pdfFontPx).toBeCloseTo(pt(12), 1);
  await closePreview(page);

  await panel(page).getByRole('button', { name: 'テーマの設定に戻す' }).click();
  await expect.poll(bodyFontPx).toBeCloseTo(pt(10.5), 1);
  await expect(panel(page).getByLabel('基準文字サイズ')).toHaveValue('10.5');
});

test('only the table marked landscape goes on a landscape page', async ({ page, context }) => {
  await editorBody(page).getByText('キャプションなし').click();
  await expect(landscapeButton(page)).toBeDisabled();

  await editorBody(page).getByText('横', { exact: true }).click();
  await expect(landscapeButton(page)).toHaveAttribute('aria-pressed', 'false');
  await landscapeButton(page).click();
  await expect(landscapeButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(editorBody(page).locator('.table-figure.is-landscape')).toHaveCount(1);
  await expect(editorBody(page).locator('.table-figure.is-landscape .table-caption')).toHaveText(
    /横にする表/,
  );

  await openPreview(page);
  const pages = await frame(page)
    .locator('[data-vivliostyle-page-container]')
    .evaluateAll((containers: HTMLElement[]) =>
      containers.map((c) => ({
        landscape: parseFloat(c.style.width) > parseFloat(c.style.height),
        captions: [...c.querySelectorAll('.table-caption')].map((e) => e.textContent),
      })),
    );
  const landscapePages = pages.filter((p) => p.landscape);
  expect(landscapePages).toHaveLength(1);
  expect(landscapePages[0]?.captions.join()).toContain('横にする表');
  expect(
    pages
      .filter((p) => !p.landscape)
      .flatMap((p) => p.captions)
      .join(),
  ).toContain('縦の表');
  const printed = await printedPageSizes(page, context);
  expect(printed.filter((size) => size === '297x210mm')).toHaveLength(1);
});

test('page settings and the landscape table survive export and reopening', async ({ page }) => {
  await panel(page).getByLabel('サイズ', { exact: true }).selectOption('B4');
  await panel(page).getByLabel('余白').selectOption('wide');
  await panel(page).getByLabel('基準文字サイズ').selectOption('9');
  await editorBody(page).getByText('横', { exact: true }).click();
  await landscapeButton(page).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  const html = readFileSync(await (await downloadPromise).path(), 'utf8');
  expect(html).toContain('--base-font-size:9pt;');

  // Back to the theme's settings and no landscape table, then reopen the export.
  await panel(page).getByRole('button', { name: 'テーマの設定に戻す' }).click();
  await landscapeButton(page).click();
  await expect(editorBody(page).locator('.table-figure.is-landscape')).toHaveCount(0);
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
    buffer: Buffer.from(html),
  });

  await expect(editorBody(page).locator('.table-figure.is-landscape')).toHaveCount(1);
  await expect(panel(page).getByLabel('サイズ', { exact: true })).toHaveValue('B4');
  await expect(panel(page).getByLabel('余白')).toHaveValue('wide');
  await expect(panel(page).getByLabel('基準文字サイズ')).toHaveValue('9');
  await openPreview(page);
  expect(await previewPageSizes(page)).toContain('257x364mm');
});
