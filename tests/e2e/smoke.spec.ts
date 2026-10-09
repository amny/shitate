import { expect, test } from '@playwright/test';

test('app shell is displayed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Shitate')).toBeVisible();
});
