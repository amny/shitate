import { highlightCodeToHtml, highlightTokens } from './highlight';
import { CODE_LANGUAGES, resolveCodeLanguage } from './languages';
import { lowlight } from './highlight';

describe('resolveCodeLanguage', () => {
  it.each([
    ['typescript', 'typescript'],
    ['ts', 'typescript'],
    ['TS', 'typescript'],
    [' html ', 'xml'],
    ['sh', 'bash'],
    ['c#', 'csharp'],
    ['yml', 'yaml'],
  ])('resolves %j to %s', (name, id) => {
    expect(resolveCodeLanguage(name)?.id).toBe(id);
  });

  it.each([null, undefined, '', 'rust', 'plaintext'])('returns null for %j', (name) => {
    expect(resolveCodeLanguage(name)).toBeNull();
  });

  it('has a registered grammar for every language and unique names', () => {
    const registered = lowlight.listLanguages();
    const names = CODE_LANGUAGES.flatMap(({ id, aliases }) => [id, ...aliases]);
    expect(CODE_LANGUAGES.every(({ id }) => registered.includes(id))).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('highlightTokens', () => {
  const code = 'const a = "x"; // note\nreturn a;';

  it('splits code into classed runs that add up to the code', () => {
    const tokens = highlightTokens(code, 'ts');
    expect(tokens.map((t) => t.text).join('')).toBe(code);
    expect(tokens).toContainEqual({ text: 'const', classes: ['hljs-keyword'] });
    expect(tokens).toContainEqual({ text: '"x"', classes: ['hljs-string'] });
    expect(tokens).toContainEqual({ text: '// note', classes: ['hljs-comment'] });
  });

  it('flattens nested elements by joining their classes', () => {
    const tokens = highlightTokens('function f() {}', 'javascript');
    expect(tokens).toContainEqual({ text: 'f', classes: ['hljs-title', 'function_'] });
  });

  it.each([null, '', 'rust'])('does not highlight (or auto-detect) language %j', (language) => {
    expect(highlightTokens(code, language)).toEqual([{ text: code, classes: [] }]);
  });

  it('returns no runs for empty code', () => {
    expect(highlightTokens('', 'ts')).toEqual([]);
  });
});

describe('highlightCodeToHtml', () => {
  it('outputs spans with escaped text', () => {
    expect(highlightCodeToHtml('"<a>" & b', 'js')).toBe(
      '<span class="hljs-string">&quot;&lt;a&gt;&quot;</span> &amp; b',
    );
  });

  it('escapes plain code', () => {
    expect(highlightCodeToHtml('</code><script>', null)).toBe('&lt;/code&gt;&lt;script&gt;');
  });
});
