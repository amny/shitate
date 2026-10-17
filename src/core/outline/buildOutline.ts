import type { Labels } from '../labels';

/** Parts outside the body (cover / revision history) and the TOC node, in output order. */
export type OutlineFrontKind = 'cover' | 'revisions' | 'toc';

export interface OutlineFrontItem {
  kind: OutlineFrontKind;
  label: string;
}

export interface OutlineHeadingItem {
  id: string;
  level: number;
  /** "" when the heading is not numbered. */
  number: string;
  text: string;
}

export interface OutlineCaptionItem {
  id: string;
  kind: 'figure' | 'table';
  /** "図1" / "表2". */
  number: string;
  caption: string;
}

export interface Outline {
  front: OutlineFrontItem[];
  headings: OutlineHeadingItem[];
  /** Figures first, then tables, each in document order. */
  captions: OutlineCaptionItem[];
}

export interface OutlineInput {
  labels: Labels;
  hasCover: boolean;
  hasRevisions: boolean;
  hasToc: boolean;
}

const FRONT_LABELS: Record<OutlineFrontKind, string> = {
  cover: '表紙',
  revisions: '改訂履歴',
  toc: '目次',
};

/**
 * Items of the outline panel (design.md §5.8). Numbers come only from computeLabels, so the
 * panel always matches the editor and the export.
 */
export function buildOutline({ labels, hasCover, hasRevisions, hasToc }: OutlineInput): Outline {
  const frontKinds: OutlineFrontKind[] = [
    ...(hasCover ? (['cover'] as const) : []),
    ...(hasRevisions ? (['revisions'] as const) : []),
    ...(hasToc ? (['toc'] as const) : []),
  ];
  return {
    front: frontKinds.map((kind) => ({ kind, label: FRONT_LABELS[kind] })),
    headings: labels.toc.map(({ id, level, number, text }) => ({ id, level, number, text })),
    captions: [
      ...[...labels.figures].map(([id, label]) => ({
        id,
        kind: 'figure' as const,
        number: `図${String(label.number)}`,
        caption: label.caption,
      })),
      ...[...labels.tables].map(([id, label]) => ({
        id,
        kind: 'table' as const,
        number: `表${String(label.number)}`,
        caption: label.caption,
      })),
    ],
  };
}
