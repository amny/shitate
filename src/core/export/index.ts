export { buildExportHtml, createEmbeddedData, EMBEDDED_DATA_ELEMENT_ID } from './buildExportHtml';
export type { ExportOptions } from './buildExportHtml';
export { toExportFileName } from './fileName';
export {
  renderTocContent,
  renderTocNav,
  resolveTocDepth,
  splitToc,
  TOC_TITLE,
  tocEntriesUpTo,
} from './toc';
export type { TocDepth } from './toc';
export {
  formatJapaneseDate,
  hasCover,
  renderCover,
  renderFooter,
  renderHeader,
  renderRevisions,
  REVISIONS_TITLE,
} from './templates';
