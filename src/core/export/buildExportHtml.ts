import { generateHTML } from '@tiptap/core';
import type { Extensions, JSONContent } from '@tiptap/core';
import { computeLabels, resolveNumberingStartLevel } from '../labels';
import { EMBEDDED_DATA_FORMAT, EMBEDDED_DATA_VERSION } from '../model';
import type { DocumentState, EmbeddedData, Theme } from '../model';
import { replaceMermaidBlocks } from './diagrams';
import { highlightCodeBlocks } from './highlightCode';
import { escapeHtml, escapeStyleContent, serializeJsonForScript } from './escape';
import { IMAGE_VIEWER_CSS, IMAGE_VIEWER_SCRIPT, IMAGE_VIEWER_STYLE_ID } from './imageViewer';
import { insertResolvedLabels } from './resolveLabels';
import { resolvePageSettings } from '../pdf/pageCss';
import { buildThemeVars, resolveHeaderFooter } from '../theme/themeVars';
import { renderCover, renderFooter, renderHeader, renderRevisions } from './templates';
import { renderTocNav, resolveTocDepth, splitToc } from './toc';

export interface ExportOptions {
  /** The editor's extensions, so the body is rendered with the editor's schema. */
  extensions: Extensions;
  /**
   * Adds the image viewer (click to show an image at its natural size, §7.3).
   * Off for the PDF, which is not interactive. Default: true.
   */
  imageViewer?: boolean;
  /**
   * The Mermaid diagrams of the document as normalized SVGs, in document order; null for a
   * diagram that could not be rendered (design.md §5.9, §7). Rendering needs the DOM and is
   * asynchronous, so the caller prepares them (prepareDiagrams). A diagram without an SVG is
   * exported as its code block. Default: none.
   */
  diagrams?: readonly (string | null)[];
}

export const EMBEDDED_DATA_ELEMENT_ID = 'doc-data';
const FALLBACK_TITLE = '文書';

/** The editing data embedded in exported HTML (also used for drafts). */
export function createEmbeddedData(state: DocumentState, theme: Theme): EmbeddedData {
  return { format: EMBEDDED_DATA_FORMAT, version: EMBEDDED_DATA_VERSION, state, theme };
}

/**
 * Builds the self-contained delivery HTML (design.md §7).
 * Header, cover, revisions, TOC, body (with resolved labels), footer, theme CSS with its
 * variables, and the embedded data.
 */
export function buildExportHtml(
  state: DocumentState,
  theme: Theme,
  { extensions, imageViewer = true, diagrams = [] }: ExportOptions,
): string {
  const data: EmbeddedData = {
    format: EMBEDDED_DATA_FORMAT,
    version: EMBEDDED_DATA_VERSION,
    state,
    theme,
  };
  const labels = computeLabels(state.doc, {
    startLevel: resolveNumberingStartLevel(theme.settings, state.settingsOverride),
  });
  // The TOC node is rendered before <main>, not inside the body (design.md §7.1).
  const { hasToc, body: bodyDoc } = splitToc(state.doc);
  const toc = hasToc
    ? renderTocNav(labels.toc, resolveTocDepth(theme.settings, state.settingsOverride))
    : null;
  const headerFooter = resolveHeaderFooter(theme.settings, state.settingsOverride);
  const body = highlightCodeBlocks(
    replaceMermaidBlocks(
      insertResolvedLabels(generateHTML(bodyDoc as JSONContent, extensions), labels),
      diagrams,
    ),
  );
  const title = state.meta.title.trim() || FALLBACK_TITLE;

  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style id="theme-vars">${escapeStyleContent(
      buildThemeVars({
        ...headerFooter,
        baseFontPt: resolvePageSettings(theme.settings, state.settingsOverride).baseFontPt,
      }),
    )}</style>`,
    `<style id="theme">${escapeStyleContent(theme.css)}</style>`,
    ...(imageViewer
      ? [`<style id="${IMAGE_VIEWER_STYLE_ID}">${escapeStyleContent(IMAGE_VIEWER_CSS)}</style>`]
      : []),
    '</head>',
    '<body>',
    '<div class="doc">',
    // Output order: header, cover -> revisions -> TOC -> body, footer (requirements).
    ...[
      renderHeader(headerFooter),
      renderCover(state.meta),
      renderRevisions(state.revisions),
      toc ?? '',
      `<main class="doc-body">${body}</main>`,
      renderFooter(headerFooter),
    ].filter((part) => part !== ''),
    '</div>',
    `<script type="application/json" id="${EMBEDDED_DATA_ELEMENT_ID}">${serializeJsonForScript(data)}</script>`,
    ...(imageViewer ? [`<script>${IMAGE_VIEWER_SCRIPT}</script>`] : []),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
