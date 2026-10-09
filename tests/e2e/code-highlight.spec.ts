import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

interface TestEditor {
  state: { doc: { firstChild: { type: { name: string }; content: { size: number } } | null } };
  commands: { focus: (position: number) => boolean };
}

type TestWindow = Window & { __shitateEditor?: TestEditor };

function editorBody(page: Page): Locator {
  return page.locator('.doc .doc-body');
}

function languageSelect(page: Page): Locator {
  return editorBody(page).getByRole('combobox', { name: 'コードの言語' });
}

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

/** Creates a code block with the given code (plain text, no language). */
async function insertCodeBlock(page: Page, code: string): Promise<void> {
  await editorBody(page).click();
  await page.getByRole('button', { name: 'コードブロック', exact: true }).click();
  await page.keyboard.type(code);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('a new code block is plain text until a language is chosen', async ({ page }) => {
  await insertCodeBlock(page, 'const a = 1;');
  const code = editorBody(page).locator('pre > code');
  await expect(languageSelect(page)).toHaveValue('');
  await expect(code.locator('[class*="hljs-"]')).toHaveCount(0);

  await languageSelect(page).selectOption({ label: 'TypeScript' });
  await expect(code.locator('.hljs-keyword')).toHaveText('const');
  await expect(code.locator('.hljs-number')).toHaveText('1');
  await expect(code).toHaveText('const a = 1;');

  // Highlighting follows edits, and the language change can be undone.
  await page.evaluate(() => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    // The code block is the first node; put the cursor at the end of its text.
    const block = editor.state.doc.firstChild;
    if (block?.type.name !== 'codeBlock') throw new Error('the first node is not a code block');
    editor.commands.focus(1 + block.content.size);
  });
  await page.keyboard.type(' // memo');
  await expect(code.locator('.hljs-comment')).toHaveText('// memo');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(languageSelect(page)).toHaveValue('');
  await expect(code.locator('[class*="hljs-"]')).toHaveCount(0);
});

test('a Markdown fence with an alias selects its language', async ({ page }) => {
  await editorBody(page).click();
  await page.keyboard.type('```sh ');
  await page.keyboard.type('echo "hi"');
  await expect(languageSelect(page)).toHaveValue('bash');
  await expect(editorBody(page).locator('pre > code .hljs-built_in')).toHaveText('echo');
});

test('the exported HTML has the highlighting but not the picker', async ({ page }) => {
  await insertCodeBlock(page, 'SELECT 1;');
  await languageSelect(page).selectOption('sql');
  const html = await exportHtml(page);
  expect(html).toContain(
    '<pre><code class="language-sql"><span class="hljs-keyword">SELECT</span> <span class="hljs-number">1</span>;</code></pre>',
  );
  expect(html).not.toContain('code-language-select');
});
