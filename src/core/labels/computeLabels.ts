import type { DocNode, DocRoot, DocumentState, ThemeSettings } from '../model';

export interface HeadingLabel {
  /** "2.1.3", or "" when the heading is not numbered (H6 / numbered=false). */
  number: string;
  level: number;
  text: string;
}

export interface CaptionLabel {
  number: number;
  caption: string;
}

export interface TocEntry {
  id: string;
  level: number;
  number: string;
  text: string;
}

export interface Labels {
  headings: Map<string, HeadingLabel>;
  figures: Map<string, CaptionLabel>;
  tables: Map<string, CaptionLabel>;
  toc: TocEntry[];
}

/** Deepest numbered heading level: H6 is never numbered (design.md §5.4). */
const LAST_NUMBERED_LEVEL = 5;

export type NumberingStartLevel = NonNullable<ThemeSettings['numberingStartLevel']>;

export const DEFAULT_NUMBERING_START_LEVEL: NumberingStartLevel = 1;

export interface ComputeLabelsOptions {
  /** Heading level numbered as "1" (design.md §5.4). Default: 1. */
  startLevel?: NumberingStartLevel;
}

/** The start level in effect: the document's override, else the theme's setting, else 1. */
export function resolveNumberingStartLevel(
  theme: ThemeSettings,
  override: DocumentState['settingsOverride'],
): NumberingStartLevel {
  return (
    override?.numberingStartLevel ?? theme.numberingStartLevel ?? DEFAULT_NUMBERING_START_LEVEL
  );
}

function textOf(node: DocNode): string {
  if (node.type === 'text') {
    return node.text ?? '';
  }
  return (node.content ?? []).map(textOf).join('');
}

function idOf(node: DocNode): string | null {
  const id = node.attrs?.['id'];
  return typeof id === 'string' && id !== '' ? id : null;
}

function levelOf(node: DocNode): number {
  const level = node.attrs?.['level'];
  return typeof level === 'number' ? level : 1;
}

function captionOf(node: DocNode, captionType: string): string {
  const caption = (node.content ?? []).find((child) => child.type === captionType);
  return caption ? textOf(caption) : '';
}

/**
 * Computes heading numbers, figure / table numbers and TOC entries (design.md §5.4).
 * The single source of numbering for both the editor display and the export.
 */
export function computeLabels(
  doc: DocRoot,
  { startLevel = DEFAULT_NUMBERING_START_LEVEL }: ComputeLabelsOptions = {},
): Labels {
  const labels: Labels = { headings: new Map(), figures: new Map(), tables: new Map(), toc: [] };
  const counters = new Array<number>(LAST_NUMBERED_LEVEL - startLevel + 1).fill(0);
  let figureCount = 0;
  let tableCount = 0;
  // Level of the numbered=false heading whose sub-headings are also left unnumbered.
  let unnumberedSectionLevel: number | null = null;

  /** `tier` is 1 for the start level, 2 for the level below it, and so on. */
  const numberHeading = (tier: number): string => {
    // Skipped levels count as 1 so numbers never repeat (e.g. H1 then H3 -> 1.1.1).
    for (let i = 0; i < tier - 1; i++) {
      if (counters[i] === 0) counters[i] = 1;
    }
    counters[tier - 1] = (counters[tier - 1] ?? 0) + 1;
    counters.fill(0, tier);
    return counters.slice(0, tier).join('.');
  };

  const visit = (node: DocNode): void => {
    switch (node.type) {
      case 'heading': {
        const level = levelOf(node);
        if (unnumberedSectionLevel !== null && level <= unnumberedSectionLevel) {
          unnumberedSectionLevel = null;
        }
        const insideUnnumbered = unnumberedSectionLevel !== null;
        // Headings above the start level and H6 are outside the numbering entirely.
        const numberable = level >= startLevel && level <= LAST_NUMBERED_LEVEL;
        if (numberable && !insideUnnumbered && node.attrs?.['numbered'] === false) {
          unnumberedSectionLevel = level;
        }
        const numbered = numberable && !insideUnnumbered && node.attrs?.['numbered'] !== false;
        const number = numbered ? numberHeading(level - startLevel + 1) : '';
        const id = idOf(node);
        const text = textOf(node);
        if (id) {
          labels.headings.set(id, { number, level, text });
          labels.toc.push({ id, level, number, text });
        }
        return;
      }
      case 'figure': {
        figureCount++;
        const id = idOf(node);
        if (id)
          labels.figures.set(id, { number: figureCount, caption: captionOf(node, 'figcaption') });
        return;
      }
      case 'tableFigure': {
        tableCount++;
        const id = idOf(node);
        if (id)
          labels.tables.set(id, { number: tableCount, caption: captionOf(node, 'tableCaption') });
        // Tables nested in its cells carry no number (design.md §5.2).
        return;
      }
      default:
        for (const child of node.content ?? []) visit(child);
    }
  };

  for (const node of doc.content ?? []) visit(node);
  return labels;
}

/** Text for a cross reference, or null when the target does not exist (design.md §5.4). */
export function formatRef(labels: Labels, targetId: string): string | null {
  const heading = labels.headings.get(targetId);
  if (heading) {
    return heading.number ? `${heading.number}節` : `「${heading.text}」`;
  }
  const figure = labels.figures.get(targetId);
  if (figure) {
    return `図${String(figure.number)}`;
  }
  const table = labels.tables.get(targetId);
  if (table) {
    return `表${String(table.number)}`;
  }
  return null;
}
