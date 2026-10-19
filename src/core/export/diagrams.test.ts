import { replaceMermaidBlocks } from './diagrams';

describe('replaceMermaidBlocks', () => {
  const body =
    '<pre><code class="language-mermaid">flowchart LR\n  A --&gt; B</code></pre>' +
    '<pre><code class="language-sql">SELECT 1;</code></pre>' +
    '<pre><code class="language-Mermaid">pie</code></pre>' +
    '<pre><code>plain</code></pre>' +
    '<pre><code class="language-mermaid"></code></pre>';

  it('replaces the Mermaid blocks in order and leaves other code blocks', () => {
    expect(
      replaceMermaidBlocks(body, ['<svg id="mermaid-1"/>', '<svg id="mermaid-2"/>', null]),
    ).toBe(
      '<div class="mermaid-diagram"><svg id="mermaid-1"/></div>' +
        '<pre><code class="language-sql">SELECT 1;</code></pre>' +
        '<div class="mermaid-diagram"><svg id="mermaid-2"/></div>' +
        '<pre><code>plain</code></pre>' +
        '<pre><code class="language-mermaid"></code></pre>',
    );
  });

  it('keeps a block as code when its diagram is null or missing', () => {
    expect(replaceMermaidBlocks(body, [null])).toBe(body);
    expect(replaceMermaidBlocks(body, [])).toBe(body);
  });
});
