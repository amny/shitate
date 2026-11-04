import { test } from '@playwright/test';
const broken = () =>
  [...document.querySelectorAll('[data-vivliostyle-page-container] svg *')].filter((el) =>
    [...el.attributes].some((a) => a.value.includes('#viv-id-'))).length;
test('refs survive navigation and view changes', async ({ page }) => {
  await page.goto('/?pdf=1');
  await page.waitForSelector('#status[data-done="true"]', { timeout: 100_000 });
  const log = [['after fix', await page.evaluate(broken)]];
  for (let i = 0; i < 4; i++) await page.evaluate(() => window.__viewer.navigateToPage('next'));
  await page.waitForTimeout(800);
  log.push(['after next x4', await page.evaluate(broken)]);
  await page.evaluate(() => window.__viewer.setOptions({ pageViewMode: 'spread', zoom: 0.7 }));
  await page.waitForTimeout(1500);
  log.push(['after spread+zoom', await page.evaluate(broken), await page.evaluate(() => window.__viewer.readyState)]);
  await page.evaluate(() => window.__viewer.setOptions({ fontSize: 20 }));
  await page.waitForTimeout(2500);
  log.push(['after relayout', await page.evaluate(broken), await page.evaluate(() => window.__viewer.readyState)]);
  console.log(JSON.stringify(log));
});
