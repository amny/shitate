import { normalizeImportedHtml } from './normalizeHtml';

describe('normalizeImportedHtml', () => {
  it('removes numbers inserted by the export', () => {
    expect(
      normalizeImportedHtml(
        '<h2 id="h-1"><span class="heading-number">1.1</span>目的</h2><figure><img src="x"><figcaption><span class="caption-number">図1</span>構成</figcaption></figure>',
      ),
    ).toBe('<h2 id="h-1">目的</h2><figure><img src="x"><figcaption>構成</figcaption></figure>');
  });

  it('wraps a table with <caption> as a table figure', () => {
    expect(
      normalizeImportedHtml(
        '<p>前</p><table><caption>画面<b>一覧</b></caption><tbody><tr><td>a</td></tr></tbody></table>',
      ),
    ).toBe(
      '<p>前</p><div class="table-figure"><div class="table-caption">画面<b>一覧</b></div><table><tbody><tr><td>a</td></tr></tbody></table></div>',
    );
  });

  it('turns <figure> with a table into a table figure', () => {
    expect(
      normalizeImportedHtml(
        '<figure><table><tbody><tr><td>a</td></tr></tbody></table><figcaption>表題</figcaption></figure>',
      ),
    ).toBe(
      '<div class="table-figure"><div class="table-caption">表題</div><table><tbody><tr><td>a</td></tr></tbody></table></div>',
    );
  });

  it('leaves exported table figures and plain tables as they are', () => {
    const html =
      '<div class="table-figure" id="t-1"><div class="table-caption">表題</div><table><tbody><tr><td>a</td></tr></tbody></table></div><table><tbody><tr><td>b</td></tr></tbody></table>';
    expect(normalizeImportedHtml(html)).toBe(html);
  });
});
