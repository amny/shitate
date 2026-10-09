import { formatRef } from '../labels';
import type { Labels } from '../labels';

/** Output for a cross reference whose target no longer exists. */
export const BROKEN_REF_TEXT = '参照先なし';

const HEADING_SELECTOR = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]';

function numberSpan(document: Document, className: string, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

/**
 * Inserts resolved labels into the rendered body HTML (design.md §7.1 step 3):
 * heading numbers as `span.heading-number`, figure / table numbers as `span.caption-number`
 * at the start of their captions, and cross references as `<a class="xref" href="#id">2.1節</a>`. The schema renders no numbers, so the document data never
 * contains them.
 */
export function insertResolvedLabels(bodyHtml: string, labels: Labels): string {
  const document = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html');
  const { body } = document;

  for (const heading of body.querySelectorAll(HEADING_SELECTOR)) {
    const number = labels.headings.get(heading.id)?.number;
    if (number) {
      heading.prepend(numberSpan(document, 'heading-number', number));
    }
  }
  for (const figure of body.querySelectorAll('figure[id]')) {
    const label = labels.figures.get(figure.id);
    const caption = figure.querySelector(':scope > figcaption');
    if (label && caption) {
      caption.prepend(numberSpan(document, 'caption-number', `図${String(label.number)}`));
    }
  }
  for (const tableFigure of body.querySelectorAll('.table-figure[id]')) {
    const label = labels.tables.get(tableFigure.id);
    const caption = tableFigure.querySelector(':scope > .table-caption');
    if (label && caption) {
      caption.prepend(numberSpan(document, 'caption-number', `表${String(label.number)}`));
    }
  }
  for (const ref of body.querySelectorAll('span.xref[data-target-id]')) {
    const targetId = ref.getAttribute('data-target-id') ?? '';
    const label = formatRef(labels, targetId);
    const resolved = document.createElement(label === null ? 'span' : 'a');
    resolved.className = 'xref';
    if (label !== null) {
      resolved.setAttribute('href', `#${targetId}`);
    }
    resolved.textContent = label ?? BROKEN_REF_TEXT;
    ref.replaceWith(resolved);
  }
  return body.innerHTML;
}
