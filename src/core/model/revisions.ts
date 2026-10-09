import { nanoid } from 'nanoid';
import { toIsoDate } from './defaults';
import type { Revision } from './types';

/** A new, empty revision row: version from the cover, today's date. */
export function createRevision(version: string, today: Date): Revision {
  return { id: `r-${nanoid(8)}`, version, date: toIsoDate(today), description: '', author: '' };
}

export function updateRevision(
  revisions: readonly Revision[],
  id: string,
  patch: Partial<Omit<Revision, 'id'>>,
): Revision[] {
  return revisions.map((revision) => (revision.id === id ? { ...revision, ...patch } : revision));
}

export function removeRevision(revisions: readonly Revision[], id: string): Revision[] {
  return revisions.filter((revision) => revision.id !== id);
}

/** Moves a row up (-1) or down (+1). Out of range moves leave the list as it is. */
export function moveRevision(
  revisions: readonly Revision[],
  id: string,
  offset: -1 | 1,
): Revision[] {
  const from = revisions.findIndex((revision) => revision.id === id);
  const to = from + offset;
  const moving = revisions[from];
  if (from < 0 || to < 0 || to >= revisions.length || !moving) {
    return [...revisions];
  }
  const rest = revisions.filter((_, index) => index !== from);
  return [...rest.slice(0, to), moving, ...rest.slice(to)];
}
