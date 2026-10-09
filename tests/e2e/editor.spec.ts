import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mO4WR6OFTEMLQkAcq9pwfhQlf4AAAAASUVORK5CYII=';

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

/** Types a paragraph and selects its whole text. */
async function typeAndSelect(page: Page, text: string): Promise<void> {
  const body = editorBody(page);
  await body.click();
  await page.keyboard.type(text);
  await body.locator('p, h1, h2, h3, h4, h5, h6').first().click({ clickCount: 3 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('editable root carries the theme classes', async ({ page }) => {
  // .doc > [cover / revisions preview] + div > .doc-body (design.md §8.1, task 2-6).
  await expect(page.locator('.doc .doc-body[contenteditable="true"]')).toHaveCount(1);
});

const markCases = [
  { label: '太字', shortcut: 'ControlOrMeta+b', selector: 'strong' },
  { label: '斜体', shortcut: 'ControlOrMeta+i', selector: 'em' },
  { label: '下線', shortcut: 'ControlOrMeta+u', selector: 'u' },
  { label: '取り消し線', shortcut: 'ControlOrMeta+Shift+s', selector: 's' },
  { label: 'インラインコード', shortcut: 'ControlOrMeta+e', selector: 'code' },
];

for (const { label, shortcut, selector } of markCases) {
  test(`${label}: button toggles the mark`, async ({ page }) => {
    await typeAndSelect(page, '書式のテスト');
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(editorBody(page).locator(`p > ${selector}`)).toHaveText('書式のテスト');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await button.click();
    await expect(editorBody(page).locator(`p > ${selector}`)).toHaveCount(0);
  });

  test(`${label}: shortcut ${shortcut} toggles the mark`, async ({ page }) => {
    await typeAndSelect(page, '書式のテスト');
    await page.keyboard.press(shortcut);
    await expect(editorBody(page).locator(`p > ${selector}`)).toHaveText('書式のテスト');
  });
}

const blockCases = [
  { label: '箇条書き', shortcut: 'ControlOrMeta+Shift+8', selector: 'ul > li' },
  { label: '番号付きリスト', shortcut: 'ControlOrMeta+Shift+7', selector: 'ol > li' },
  { label: '引用', shortcut: 'ControlOrMeta+Shift+b', selector: 'blockquote > p' },
  { label: 'コードブロック', shortcut: 'ControlOrMeta+Alt+c', selector: 'pre > code' },
];

for (const { label, shortcut, selector } of blockCases) {
  test(`${label}: button applies the block`, async ({ page }) => {
    await typeAndSelect(page, 'ブロックのテスト');
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(editorBody(page).locator(selector)).toHaveText('ブロックのテスト');
  });

  test(`${label}: shortcut ${shortcut} applies the block`, async ({ page }) => {
    await typeAndSelect(page, 'ブロックのテスト');
    await page.keyboard.press(shortcut);
    await expect(editorBody(page).locator(selector)).toHaveText('ブロックのテスト');
  });
}

test('heading: select and shortcuts change the block type', async ({ page }) => {
  await typeAndSelect(page, '見出しのテスト');
  const select = page.getByRole('combobox', { name: '段落の種類' });
  await select.selectOption('h2');
  await expect(editorBody(page).locator('h2')).toHaveText(/^[\d.]+見出しのテスト$/);
  await expect(select).toHaveValue('h2');

  await editorBody(page).locator('h2').click();
  await page.keyboard.press('ControlOrMeta+Alt+3');
  await expect(editorBody(page).locator('h3')).toHaveText(/^[\d.]+見出しのテスト$/);
  await page.keyboard.press('ControlOrMeta+Alt+0');
  await expect(editorBody(page).locator('p').first()).toHaveText('見出しのテスト');
  await expect(select).toHaveValue('paragraph');
});

test('undo and redo with buttons and shortcuts', async ({ page }) => {
  await typeAndSelect(page, '取り消しのテスト');
  await page.keyboard.press('ControlOrMeta+b');
  const bold = editorBody(page).locator('strong');
  await expect(bold).toHaveCount(1);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(bold).toHaveCount(0);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect(bold).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+z');
  await expect(bold).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(bold).toHaveCount(1);
});

test('horizontal rule button inserts a rule', async ({ page }) => {
  await editorBody(page).click();
  await page.getByRole('button', { name: '水平線' }).click();
  await expect(editorBody(page).locator('hr')).toHaveCount(1);
});

test('image button inserts a block image as a data URI', async ({ page }) => {
  await editorBody(page).click();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '画像' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });

  const image = editorBody(page).locator('img');
  await expect(image).toHaveAttribute('src', `data:image/png;base64,${PNG_BASE64}`);
  await expect(image).toHaveAttribute('alt', 'diagram');
  // Block image: not wrapped in a paragraph.
  await expect(editorBody(page).locator('p img')).toHaveCount(0);
});

test.describe('link', () => {
  test('button sets a link on the selection', async ({ page }) => {
    await typeAndSelect(page, 'リンクのテスト');
    await page.getByRole('button', { name: 'リンク' }).click();
    const input = page.getByLabel('リンク先URL');
    await input.fill('https://example.com/');
    await input.press('Enter');
    await expect(editorBody(page).locator('a')).toHaveAttribute('href', 'https://example.com/');
    await expect(editorBody(page).locator('a')).toHaveText('リンクのテスト');
  });

  test('Mod-k opens the input and an empty URL removes the link', async ({ page }) => {
    await typeAndSelect(page, 'リンクのテスト');
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByLabel('リンク先URL').fill('https://example.com/');
    await page.getByRole('button', { name: '適用' }).click();
    await expect(editorBody(page).locator('a')).toHaveCount(1);

    await editorBody(page).locator('a').click();
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByLabel('リンク先URL');
    await expect(input).toHaveValue('https://example.com/');
    await input.fill('');
    await input.press('Enter');
    await expect(editorBody(page).locator('a')).toHaveCount(0);
  });

  test('rejects javascript: URLs', async ({ page }) => {
    await typeAndSelect(page, 'リンクのテスト');
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByLabel('リンク先URL');
    await input.fill('javascript:alert(1)');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toContainText('で始まるURLを入力してください');
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(editorBody(page).locator('a')).toHaveCount(0);
  });
});

test.describe('IME composition', () => {
  /** Simulates a Japanese IME: composing, Enter to confirm, then commit. */
  async function composeAndConfirmWithEnter(page: Page, text: string): Promise<void> {
    const client = await page.context().newCDPSession(page);
    await client.send('Input.imeSetComposition', {
      text: 'にほんご',
      selectionStart: 4,
      selectionEnd: 4,
    });
    // The Enter that confirms the conversion: keyCode 229 with isComposing.
    await page.evaluate(() => {
      const target = document.querySelector('.doc-body');
      for (const type of ['keydown', 'keyup']) {
        target?.dispatchEvent(
          new KeyboardEvent(type, {
            key: 'Enter',
            code: 'Enter',
            keyCode: 229,
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    });
    await client.send('Input.insertText', { text });
    await client.detach();
  }

  test('Enter that confirms the conversion does not split the paragraph', async ({ page }) => {
    await editorBody(page).click();
    await page.keyboard.type('前');
    await composeAndConfirmWithEnter(page, '日本語');

    await expect(editorBody(page).locator('p').first()).toHaveText('前日本語');
    await expect(editorBody(page).locator('p')).toHaveCount(1);

    // A normal Enter after the conversion still splits the paragraph.
    await page.keyboard.press('Enter');
    await page.keyboard.type('次');
    await expect(editorBody(page).locator('p')).toHaveText(['前日本語', '次']);
  });

  test('Enter that confirms the conversion in a list item does not add an item', async ({
    page,
  }) => {
    await editorBody(page).click();
    await page.getByRole('button', { name: '箇条書き', exact: true }).click();
    await composeAndConfirmWithEnter(page, '項目');
    await expect(editorBody(page).locator('li')).toHaveText(['項目']);
  });

  test('Enter that confirms the conversion in the link input does not apply', async ({ page }) => {
    await typeAndSelect(page, 'リンクのテスト');
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByLabel('リンク先URL');
    await input.fill('https://example.com/');
    await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true });
    await expect(page.getByRole('dialog', { name: 'リンクの編集' })).toBeVisible();
    await expect(editorBody(page).locator('a')).toHaveCount(0);
  });
});
