/**
 * Rules the app adds for paged output, independent of the theme (design.md §10). Passed to
 * Vivliostyle after the theme CSS. The theme's own @page rules (margin boxes) stay in the
 * theme.
 */
export const PDF_FONT_FAMILY = "'Noto Sans JP', sans-serif";

export const PDF_BASE_CSS = `
/* One font for the whole PDF (requirements 4.7). */
.doc,
.doc * {
  font-family: ${PDF_FONT_FAMILY} !important;
}

/* The page box gives the width and margins. */
.doc {
  max-width: none;
  margin: 0;
  padding: 0;
}

/* Browser-view header / footer: the PDF uses page margin boxes instead. */
.doc .doc-header,
.doc .doc-footer {
  display: none;
}

/* Cover, revisions and TOC each end their pages. */
.doc .doc-cover,
.doc .doc-revisions,
.doc .doc-toc {
  break-after: page;
}

.doc .doc-cover {
  border-bottom: 0;
}

/* TOC page numbers with a dotted leader. */
.doc .doc-toc .toc-item::after {
  content: leader(dotted) target-counter(attr(href url), page);
}

/* Do not leave a heading or a caption alone at the bottom of a page. */
.doc .doc-body h1,
.doc .doc-body h2,
.doc .doc-body h3,
.doc .doc-body h4,
.doc .doc-body h5,
.doc .doc-body h6,
.doc .table-caption {
  break-after: avoid;
}

/*
 * Figures and table rows are not split. A whole table is not kept together: a table longer
 * than a page would leave the previous page empty (S-1).
 */
.doc .doc-body figure,
.doc .doc-body tr {
  break-inside: avoid;
}

/* Repeat the header row on every page of a split table. */
.doc .doc-body thead {
  display: table-header-group;
}
`;
