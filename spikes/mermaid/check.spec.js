// S-2: renders the diagrams with htmlLabels off/on, saves screenshots and a summary,
// then typesets them with Vivliostyle and saves every page.
import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';

mkdirSync('results', { recursive: true });

for (const htmlLabels of ['0', '1']) {
  test(`render htmlLabels=${htmlLabels}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/?htmlLabels=${htmlLabels}`);
    await page.waitForSelector('#status[data-done="true"]', { timeout: 100_000 });
    const result = await page.evaluate(() => window.__result);
    writeFileSync(`results/render-${htmlLabels}.json`, JSON.stringify({ ...result, errors }, null, 2));
    await page.locator('#viewport').screenshot({ path: `results/render-${htmlLabels}.png` });
  });
}

for (const htmlLabels of ['0', '1']) {
  test(`vivliostyle htmlLabels=${htmlLabels}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
    });
    await page.goto(`/?pdf=1&htmlLabels=${htmlLabels}`);
    await page.waitForSelector('#status[data-done="true"]', { timeout: 100_000 });
    const result = await page.evaluate(() => window.__result);
    writeFileSync(`results/pdf-${htmlLabels}.json`, JSON.stringify({ ...result, errors }, null, 2));
    const containers = page.locator('[data-vivliostyle-page-container]');
    const count = await containers.count();
    for (let i = 0; i < count; i++) {
      const c = containers.nth(i);
      await c.evaluate((el) => {
        for (const other of document.querySelectorAll('[data-vivliostyle-page-container]'))
          other.style.display = other === el ? 'block' : 'none';
      });
      await c.screenshot({ path: `results/pdf-${htmlLabels}-p${i + 1}.png` });
    }
    await page.pdf({ path: `results/pdf-${htmlLabels}.pdf`, preferCSSPageSize: true, printBackground: true });
  });
}
