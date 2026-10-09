import { createRevision, moveRevision, removeRevision, updateRevision } from './revisions';
import { revisionSchema } from './schema';
import type { Revision } from './types';

const row = (id: string): Revision => ({
  id,
  version: id,
  date: '2026-10-01',
  description: '',
  author: '',
});
const ids = (revisions: readonly Revision[]) => revisions.map((r) => r.id);

describe('revisions', () => {
  const list = [row('a'), row('b'), row('c')];

  it('creates a valid empty row with the version and the local date', () => {
    const created = createRevision('1.2', new Date(2026, 9, 8, 23, 30));
    expect(revisionSchema.safeParse(created).success).toBe(true);
    expect(created).toMatchObject({
      version: '1.2',
      date: '2026-10-08',
      description: '',
      author: '',
    });
    expect(createRevision('1.2', new Date()).id).not.toBe(created.id);
  });

  it('updates only the row with the id, without changing the input', () => {
    const updated = updateRevision(list, 'b', { description: '変更' });
    expect(updated[1]).toEqual({ ...row('b'), description: '変更' });
    expect(updated[0]).toBe(list[0]);
    expect(list[1]?.description).toBe('');
  });

  it('removes a row', () => {
    expect(ids(removeRevision(list, 'b'))).toEqual(['a', 'c']);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });

  it.each([
    ['a', 1, ['b', 'a', 'c']],
    ['c', -1, ['a', 'c', 'b']],
    ['a', -1, ['a', 'b', 'c']],
    ['c', 1, ['a', 'b', 'c']],
    ['missing', 1, ['a', 'b', 'c']],
  ] as const)('moves %s by %d', (id, offset, expected) => {
    expect(ids(moveRevision(list, id, offset))).toEqual(expected);
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });
});
