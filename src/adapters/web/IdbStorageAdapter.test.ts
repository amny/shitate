import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { IdbStorageAdapter } from './IdbStorageAdapter';

describe('IdbStorageAdapter', () => {
  let adapter: IdbStorageAdapter;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    adapter = new IdbStorageAdapter('test-db');
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('returns undefined for a missing key', async () => {
    expect(await adapter.get('drafts', 'current')).toBeUndefined();
  });

  it('stores and reads back a structured value', async () => {
    const value = { doc: { type: 'doc' }, image: 'data:image/png;base64,AAAA', nested: [1, 2] };
    await adapter.set('drafts', 'current', value);
    expect(await adapter.get('drafts', 'current')).toEqual(value);
  });

  it('overwrites an existing key', async () => {
    await adapter.set('settings', 'app', { a: 1 });
    await adapter.set('settings', 'app', { a: 2 });
    expect(await adapter.get('settings', 'app')).toEqual({ a: 2 });
  });

  it('deletes a key', async () => {
    await adapter.set('themes', 'user-1', { id: 'user-1' });
    await adapter.delete('themes', 'user-1');
    expect(await adapter.get('themes', 'user-1')).toBeUndefined();
  });

  it('does not fail when deleting a missing key', async () => {
    await expect(adapter.delete('themes', 'missing')).resolves.toBeUndefined();
  });

  it('lists all values in a store', async () => {
    await adapter.set('themes', 'b', { id: 'b' });
    await adapter.set('themes', 'a', { id: 'a' });
    expect(await adapter.list('themes')).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(await adapter.list('drafts')).toEqual([]);
  });

  it('keeps stores independent', async () => {
    await adapter.set('drafts', 'same-key', 'draft');
    await adapter.set('themes', 'same-key', 'theme');
    expect(await adapter.get('drafts', 'same-key')).toBe('draft');
    expect(await adapter.get('themes', 'same-key')).toBe('theme');
  });

  it('persists across connections', async () => {
    await adapter.set('drafts', 'current', { saved: true });
    await adapter.close();
    const reopened = new IdbStorageAdapter('test-db');
    expect(await reopened.get('drafts', 'current')).toEqual({ saved: true });
    await reopened.close();
  });

  it('reports the store and key when saving fails', async () => {
    const notCloneable = { fn: () => undefined };
    const result = adapter.set('drafts', 'current', notCloneable);
    await expect(result).rejects.toThrow('Failed to set drafts/current in IndexedDB "test-db"');
    await expect(result).rejects.toHaveProperty('cause');
  });
});
