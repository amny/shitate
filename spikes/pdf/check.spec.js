// S-1: renders sample.html with both engines and sizes, saves page screenshots, PDFs and a summary.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

const ENGINES = ['vivliostyle', 'pagedjs', 'pagedjs-beta'];
const SIZES = ['a4', 'a3l', 'custom'];
const PAGE_SELECTOR = {
  vivliostyle: '[data-vivliostyle-page-container]',
  pagedjs: '.pagedjs_page',
  'pagedjs-beta': '.pagedjs_page',
};
const summary = {};

/** Page sizes (pt) from the PDF's /MediaBox entries. */
function mediaBoxes(pdf) {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*([\d.\s-]+)\]/g)].map((m) => {
    const [x0, y0, x1, y1] = m[1].trim().split(/\s+/).map(Number);
    return `${Math.round(((x1 - x0) / 72) * 25.4)}x${Math.round(((y1 - y0) / 72) * 25.4)}mm`;
  });
}

for (const engine of ENGINES) {
  for (const size of SIZES) {
    test(`${engine} ${size}`, async ({ page }) => {
      const dir = `results/${engine}-${size}`;
      mkdirSync(dir, { recursive: true });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
      });

      await page.goto(`/?engine=${engine}&size=${size}`);
      await page.waitForSelector('#status[data-done="true"]', { timeout: 100_000 });
      await page.evaluate(() => document.fonts.ready);
      const result = await page.evaluate(() => window.__result);

      const pages = page.locator(PAGE_SELECTOR[engine]);
      const count = await pages.count();
      const pageInfo = [];
      for (let i = 0; i < count; i++) {
        let target = pages.nth(i);
        if (engine === 'vivliostyle') {
          await page.evaluate((index) => window.__showPage(index), i);
          target = page.locator(`[data-vivliostyle-page-index="${i}"]`).filter({ visible: true }).first();
        }
        const box = await target.boundingBox();
        const text = (await target.innerText()).replace(/\s+/g, ' ').trim();
        pageInfo.push({
          page: i + 1,
          sizePx: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
          text: text.slice(0, 160),
          tail: text.slice(-60),
        });
        await target.screenshot({ path: `${dir}/page-${String(i + 1).padStart(2, '0')}.png` });
      }

      const fontCheck = await page.evaluate(() => ({
        notoLoaded: document.fonts.check('16px "Noto Sans JP"', '日本語'),
        bodyFont: (() => {
          const el = document.querySelector('.doc-body p');
          return el ? getComputedStyle(el).fontFamily : null;
        })(),
      }));

      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      writeFileSync(`${dir}.pdf`, pdf);

      summary[`${engine}-${size}`] = {
        ...result,
        pageCount: count,
        pageSizesPx: [...new Set(pageInfo.map((p) => p.sizePx))],
        pdfPageSizes: mediaBoxes(pdf),
        fontCheck,
        errors: errors.slice(0, 10),
        pages: pageInfo,
      };
      writeFileSync('results/summary.json', JSON.stringify(summary, null, 2));
    });
  }
}
