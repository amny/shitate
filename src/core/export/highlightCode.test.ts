import { decodeHtmlText, highlightCodeBlocks } from './highlightCode';

describe('decodeHtmlText', () => {
  it('decodes the references a serializer writes', () => {
    expect(decodeHtmlText('&lt;a&gt; &amp;amp; &quot;&#39;&#x27;&nbsp;&unknown;')).toBe(
      '<a> &amp; "\'\' &unknown;',
    );
  });
});

describe('highlightCodeBlocks', () => {
  it('highlights code blocks with a supported language', () => {
    expect(
      highlightCodeBlocks('<p>a</p><pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>'),
    ).toBe(
      '<p>a</p><pre><code class="language-ts"><span class="hljs-keyword">const</span> a = ' +
        '<span class="hljs-number">1</span> &lt; <span class="hljs-number">2</span>;</code></pre>',
    );
  });

  it('keeps the code text when its HTML-like content is highlighted', () => {
    const html = highlightCodeBlocks(
      '<pre><code class="language-html">&lt;/code&gt;&lt;/pre&gt;&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>',
    );
    const code = new DOMParser().parseFromString(html, 'text/html').querySelector('pre > code');
    expect(code?.textContent).toBe('</code></pre><script>alert(1)</script>');
    expect(code?.querySelector('script')).toBeNull();
    expect(code?.querySelector('span.hljs-tag')).not.toBeNull();
  });

  it.each([
    '<pre><code>const a = 1;</code></pre>',
    '<pre><code class="language-rust">let a = 1;</code></pre>',
    '<pre><code class="language-ts"></code></pre>',
  ])('leaves %s without a supported language or code as it is', (html) => {
    expect(highlightCodeBlocks(html)).toBe(html);
  });
});
