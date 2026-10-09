/**
 * Theme contract (design.md §8.2): the only classes and CSS variables a theme may use.
 * Keep in sync with src/themes/README.md.
 */
export const THEME_CONTRACT_CLASSES: readonly string[] = [
  // Document
  'doc',
  // Header / footer
  'doc-header',
  'doc-footer',
  'doc-logo',
  'doc-copyright',
  // Cover
  'doc-cover',
  'cover-title',
  'cover-project',
  'cover-version',
  'cover-date',
  'cover-company',
  'cover-client',
  // Revisions
  'doc-revisions',
  // Table of contents
  'doc-toc',
  'toc-title',
  'toc-item',
  'toc-level-1',
  'toc-level-2',
  'toc-level-3',
  'toc-level-4',
  'toc-level-5',
  'toc-number',
  // Body
  'doc-body',
  'heading-number',
  'table-figure',
  'is-landscape',
  'table-caption',
  'caption-number',
  'xref',
];

export const THEME_CONTRACT_VARIABLES: readonly string[] = [
  '--header-logo',
  '--copyright',
  '--base-font-size',
];

/** Descriptors that come from page settings and must not be written in a theme's @page. */
const PAGE_SETTINGS_DESCRIPTORS = ['size', 'margin'];

interface CssBlock {
  prelude: string;
  body: string;
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Splits CSS into top-level `prelude { body }` blocks (enough for theme files). */
function splitBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  let prelude = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '{') {
      if (depth === 0) {
        prelude = css.slice(preludeStart, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({ prelude, body: css.slice(bodyStart, i) });
        preludeStart = i + 1;
      }
    } else if (char === ';' && depth === 0) {
      // Top-level statement such as @import: keep it as a block without a body.
      blocks.push({ prelude: css.slice(preludeStart, i).trim(), body: '' });
      preludeStart = i + 1;
    }
  }
  return blocks;
}

/** Top-level declarations of a block body (nested blocks such as margin boxes are skipped). */
function topLevelDeclarations(body: string): string[] {
  let depth = 0;
  let flat = '';
  for (const char of body) {
    if (char === '{') depth++;
    if (depth === 0) flat += char;
    if (char === '}') depth--;
  }
  return flat
    .split(';')
    .map((declaration) => declaration.split(':')[0]?.trim() ?? '')
    .filter((name) => name !== '');
}

const SCOPED_SELECTOR = /^\.doc(?![\w-])/;

/** One contract violation; `subject` is the selector, class, property, at-rule or variable. */
export type ThemeContractViolation =
  | { kind: 'unscoped-selector'; subject: string }
  | { kind: 'unknown-class'; subject: string; selector: string }
  | { kind: 'page-descriptor'; subject: string }
  | { kind: 'unsupported-at-rule'; subject: string }
  | { kind: 'unknown-variable'; subject: string };

function checkSelectors(prelude: string, violations: ThemeContractViolation[]): void {
  for (const selector of prelude.split(',').map((s) => s.trim())) {
    if (!SCOPED_SELECTOR.test(selector)) {
      violations.push({ kind: 'unscoped-selector', subject: selector });
    }
    for (const match of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      const className = match[1] ?? '';
      if (!THEME_CONTRACT_CLASSES.includes(className)) {
        violations.push({ kind: 'unknown-class', subject: `.${className}`, selector });
      }
    }
  }
}

function checkBlocks(blocks: CssBlock[], violations: ThemeContractViolation[]): void {
  for (const { prelude, body } of blocks) {
    if (prelude.startsWith('@page')) {
      for (const name of topLevelDeclarations(body)) {
        if (PAGE_SETTINGS_DESCRIPTORS.some((d) => name === d || name.startsWith(`${d}-`))) {
          violations.push({ kind: 'page-descriptor', subject: name });
        }
      }
    } else if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      checkBlocks(splitBlocks(body), violations);
    } else if (prelude.startsWith('@')) {
      violations.push({ kind: 'unsupported-at-rule', subject: prelude });
    } else {
      checkSelectors(prelude, violations);
    }
  }
}

/** The contract violations of a theme stylesheet, as data (empty when it follows the contract). */
export function checkThemeContract(css: string): ThemeContractViolation[] {
  const source = stripComments(css);
  const violations: ThemeContractViolation[] = [];
  checkBlocks(splitBlocks(source), violations);

  const defined = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const match of source.matchAll(/var\(\s*(--[\w-]+)/g)) {
    const name = match[1] ?? '';
    if (!THEME_CONTRACT_VARIABLES.includes(name) && !defined.has(name)) {
      violations.push({ kind: 'unknown-variable', subject: name });
    }
  }
  return violations;
}

/** Developer-facing description of a violation (tests, logs). */
function describeViolation(violation: ThemeContractViolation): string {
  switch (violation.kind) {
    case 'unscoped-selector':
      return `selector not scoped under .doc: "${violation.subject}"`;
    case 'unknown-class':
      return `class not in the theme contract: "${violation.subject}" in "${violation.selector}"`;
    case 'page-descriptor':
      return `@page must not set "${violation.subject}" (it comes from page settings)`;
    case 'unsupported-at-rule':
      return `unsupported at-rule: "${violation.subject}"`;
    case 'unknown-variable':
      return `CSS variable not in the theme contract: "${violation.subject}"`;
  }
}

/** Message for the theme editor (Japanese UI). */
export function formatViolationForUser(violation: ThemeContractViolation): string {
  switch (violation.kind) {
    case 'unscoped-selector':
      return `「${violation.subject}」は .doc で始まっていません。すべてのルールは .doc の下に書いてください`;
    case 'unknown-class':
      return `「${violation.selector}」の ${violation.subject} は使えるクラスにありません`;
    case 'page-descriptor':
      return `@page に「${violation.subject}」は書けません（ページ設定から生成されます）`;
    case 'unsupported-at-rule':
      return `「${violation.subject}」は使えません（使えるのは @media / @supports / @page）`;
    case 'unknown-variable':
      return `CSS変数「${violation.subject}」は使えません（テーマ内で定義した変数は使えます）`;
  }
}

/** Returns the contract violations of a theme stylesheet (empty when it follows the contract). */
export function findThemeContractViolations(css: string): string[] {
  return checkThemeContract(css).map(describeViolation);
}
