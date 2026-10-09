// Builds contact sheets (side-by-side page thumbnails) from results/<engine>-<size>/page-NN.png.
import { readdirSync, readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [, , name, pagesArg] = process.argv;
const pages = pagesArg ? pagesArg.split(',').map(Number) : null;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
const cells = (process.env.ENGINES ?? 'vivliostyle,pagedjs').split(',')
  .map((engine) => {
    const dir = `results/${engine}-${name}`;
    const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
    const picked = pages ? files.filter((_, i) => pages.includes(i + 1)) : files;
    const imgs = picked
      .map((f) => `<figure><img src="data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}"><figcaption>${engine} ${f}</figcaption></figure>`)
      .join('');
    return `<section><h2>${engine} (${name})</h2><div class="row">${imgs}</div></section>`;
  })
  .join('');
await page.setContent(`<style>body{margin:8px;font:12px sans-serif}.row{display:flex;flex-wrap:wrap;gap:8px}figure{margin:0}img{height:360px;border:1px solid #999}h2{margin:4px 0;font-size:14px}</style>${cells}`);
await page.screenshot({ path: `results/sheet-${name}${pagesArg ? `-${pagesArg.replaceAll(',', '_')}` : ''}.png`, fullPage: true });
await browser.close();
