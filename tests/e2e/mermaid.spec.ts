import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { FrameLocator, Locator, Page } from '@playwright/test';

interface TestEditor {
  commands: { setContent: (content: unknown) => boolean };
  getJSON: () => unknown;
}
type TestWindow = Window & { __shitateEditor?: TestEditor };

const FLOWCHART = 'flowchart LR\n  ログイン --> 一覧[顧客一覧]\n  一覧 --> 詳細';
const SEQUENCE = 'sequenceDiagram\n  利用者->>サーバー: 検索要求\n  サーバー-->>利用者: 結果';
const BROKEN = 'flowchart TD\n  A -->';

const editorBody = (page: Page): Locator => page.locator('.doc .doc-body');
const languageSelect = (page: Page): Locator =>
  editorBody(page).getByRole('combobox', { name: 'コードの言語' });

function mermaidBlock(source: string): string {
  const escaped = source.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return `<pre><code class="language-mermaid">${escaped}</code></pre>`;
}

async function setContent(page: Page, html: string): Promise<void> {
  await page.evaluate((content) => {
    const editor = (window as TestWindow).__shitateEditor;
    if (!editor) throw new Error('window.__shitateEditor is not available');
    editor.commands.setContent(content);
  }, html);
}

async function exportHtml(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTMLをエクスポート' }).click();
  return readFileSync(await (await downloadPromise).path(), 'utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(editorBody(page)).toBeVisible();
});

test('Mermaid is loaded only when a document has a diagram', async ({ page }) => {
  const loaded: string[] = [];
  page.on('request', (request) => {
    if (/node_modules\/.*mermaid/.test(request.url())) loaded.push(request.url());
  });
  await page.reload();
  await expect(editorBody(page)).toBeVisible();
  await setContent(page, '<p>本文</p><pre><code class="language-sql">SELECT 1;</code></pre>');
  await page.waitForTimeout(500);
  expect(loaded).toEqual([]);

  await setContent(page, mermaidBlock(FLOWCHART));
  await expect(editorBody(page).locator('.mermaid-diagram svg')).toBeVisible();
  expect(loaded.length).toBeGreaterThan(0);
});

test('choosing Mermaid shows a diagram that follows edits and keeps it on errors', async ({
  page,
}) => {
  await editorBody(page).click();
  await page.getByRole('button', { name: 'コードブロック', exact: true }).click();
  await page.keyboard.type('flowchart LR');
  await page.keyboard.press('Enter');
  await page.keyboard.type('  A[開始] --> B[終了]');
  await languageSelect(page).selectOption({ label: 'Mermaid（図）' });
  await expect(languageSelect(page)).toHaveValue('mermaid');

  const diagram = editorBody(page).locator('.mermaid-diagram');
  const svg = diagram.locator('svg');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('開始');
  await expect(svg.locator('foreignObject')).toHaveCount(0);
  // The code stays plain text (no highlighting).
  await expect(editorBody(page).locator('pre > code [class*="hljs-"]')).toHaveCount(0);

  // Follows edits after typing stops.
  await page.keyboard.press('Enter');
  await page.keyboard.type('  B --> C[追加]');
  await expect(svg).toContainText('追加');

  // A syntax error is shown above the last diagram, which stays.
  await page.keyboard.press('Enter');
  await page.keyboard.type('  C -->');
  const error = editorBody(page).locator('.mermaid-error');
  await expect(error).toBeVisible();
  await expect(error).toContainText('図を描画できません');
  await expect(svg).toContainText('追加');

  await page.keyboard.type(' D');
  await expect(error).toBeHidden();
  await expect(svg).toContainText('D');

  // Another language turns the block back into plain code; undo brings the diagram back.
  await languageSelect(page).selectOption({ label: 'テキスト' });
  await expect(diagram).toHaveCount(0);
  await expect(editorBody(page).locator('pre > code')).toContainText('C --> D');
  await editorBody(page).locator('pre > code').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(svg).toContainText('D');
});

test('the code can be hidden and shown again without changing the document', async ({ page }) => {
  await setContent(page, mermaidBlock(FLOWCHART));
  const before = await page.evaluate(() => (window as TestWindow).__shitateEditor?.getJSON());
  const code = editorBody(page).locator('pre');
  const diagram = editorBody(page).locator('.mermaid-diagram');
  await expect(diagram.locator('svg')).toBeVisible();

  await editorBody(page).locator('.code-block-view').hover();
  await editorBody(page).getByRole('button', { name: 'コードを隠す' }).click();
  await expect(code).toBeHidden();
  await expect(diagram.locator('svg')).toBeVisible();

  await diagram.click();
  await expect(code).toBeVisible();
  await expect(editorBody(page).getByRole('button', { name: 'コードを隠す' })).toBeAttached();
  const after = await page.evaluate(() => (window as TestWindow).__shitateEditor?.getJSON());
  expect(after).toEqual(before);

  // The cursor is in the code: typing goes into the diagram source.
  await page.keyboard.press('Enter');
  await page.keyboard.type('  詳細 --> 完了');
  await expect(diagram.locator('svg')).toContainText('完了');
});

test('the exported HTML has the diagrams as inline SVG and warns about failed ones', async ({
  page,
}) => {
  await setContent(
    page,
    `<h1>図</h1>${mermaidBlock(FLOWCHART)}${mermaidBlock(SEQUENCE)}${mermaidBlock(BROKEN)}`,
  );
  await expect(editorBody(page).locator('.mermaid-diagram svg')).toHaveCount(2);
  const html = await exportHtml(page);
  await expect(page.locator('.app-notice')).toContainText(
    'Mermaidの図1件を描画できなかったため、コードのまま出力しました',
  );

  const parsed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const body = doc.querySelector('.doc-body');
    const ids = [...doc.querySelectorAll('[id]')].map((element) => element.id);
    return {
      diagramIds: [...(body?.querySelectorAll('div.mermaid-diagram > svg') ?? [])].map(
        (svg) => svg.id,
      ),
      code: [...(body?.querySelectorAll('pre > code') ?? [])].map((c) => c.textContent),
      foreignObjects: doc.querySelectorAll('foreignObject').length,
      externalRefs: [...doc.querySelectorAll('.mermaid-diagram > svg')].filter((svg) =>
        /url\((?!#)|@import|href="(?!#)/.test(svg.outerHTML),
      ).length,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      markers: [...doc.querySelectorAll('[marker-end]')].map((el) => el.getAttribute('marker-end')),
      missingMarkers: [...doc.querySelectorAll('[marker-end]')]
        .map((el) => /url\(#([^)]+)\)/.exec(el.getAttribute('marker-end') ?? '')?.[1] ?? '')
        .filter((id) => !doc.getElementById(id)),
    };
  }, html);
  expect(parsed.diagramIds).toEqual(['mermaid-1', 'mermaid-2']);
  expect(parsed.code).toEqual([BROKEN]);
  expect(parsed.foreignObjects).toBe(0);
  expect(parsed.duplicateIds).toEqual([]);
  expect(parsed.markers.length).toBeGreaterThan(0);
  expect(parsed.missingMarkers).toEqual([]);
  expect(parsed.externalRefs).toBe(0);
  expect(html).not.toContain('code-diagram-toggle');
  expect(html).not.toContain('mermaid-error');
});

test('the PDF preview shows the diagrams with their arrows, each on one page', async ({ page }) => {
  await setContent(page, `<h1>図</h1>${mermaidBlock(FLOWCHART)}${mermaidBlock(SEQUENCE)}`);
  await page.getByRole('button', { name: 'PDFプレビュー' }).click();
  const preview = page.getByRole('dialog', { name: 'PDFプレビュー' });
  await expect(preview.getByText(/^\d+ \/ 全 \d+ ページ$/)).toBeVisible({ timeout: 30_000 });

  const frame: FrameLocator = page.frameLocator('iframe[title="PDFのページ"]');
  const diagrams = frame.locator('[data-vivliostyle-page-container] .mermaid-diagram');
  // A diagram split across pages would appear on both.
  await expect(diagrams).toHaveCount(2);
  await expect(diagrams.first().locator('svg')).toBeVisible();
  const refs = await frame.locator('body').evaluate((body) => {
    const elements = [
      ...body.querySelectorAll('[data-vivliostyle-page-container] svg [marker-end]'),
    ];
    return {
      count: elements.length,
      broken: elements.filter((el) => {
        const id = /url\(#([^)]+)\)/.exec(el.getAttribute('marker-end') ?? '')?.[1];
        return !id || !body.ownerDocument.getElementById(id);
      }).length,
    };
  });
  expect(refs.count).toBeGreaterThan(0);
  expect(refs.broken).toBe(0);
});
