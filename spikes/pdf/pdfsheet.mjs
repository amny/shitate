// Contact sheet of PDF page images (results/pdfimg-<name>/p-NN.png).
import { readdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const names = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
const html = names
  .map((name) => {
    const dir = `results/pdfimg-${name}`;
    const imgs = readdirSync(dir).sort().map((f) => `<img src="data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}">`).join('');
    return `<h2>${name} (PDF)</h2><div>${imgs}</div>`;
  })
  .join('');
await page.setContent(`<style>body{margin:8px;font:12px sans-serif}img{border:1px solid #999;margin:2px;vertical-align:top}h2{font-size:14px;margin:4px 0}</style>${html}`);
await page.screenshot({ path: `results/pdfsheet-${names.join('_')}.png`, fullPage: true });
await browser.close();
