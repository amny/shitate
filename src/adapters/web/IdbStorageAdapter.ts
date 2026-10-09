import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { STORE_NAMES } from '../types';
import type { StorageAdapter, StoreName } from '../types';

interface ShitateDB extends DBSchema {
  drafts: { key: string; value: unknown };
  themes: { key: string; value: unknown };
  settings: { key: string; value: unknown };
}

export const DEFAULT_DB_NAME = 'shitate';
const DB_VERSION = 1;

/** StorageAdapter backed by IndexedDB (design.md §9.1). */
export class IdbStorageAdapter implements StorageAdapter {
  readonly #dbName: string;
  #dbPromise: Promise<IDBPDatabase<ShitateDB>> | null = null;

  constructor(dbName: string = DEFAULT_DB_NAME) {
    this.#dbName = dbName;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.#run(`get ${store}/${key}`, async (db) => {
      const value = await db.get(store, key);
      return value as T | undefined;
    });
  }

  async set(store: StoreName, key: string, value: unknown): Promise<void> {
    await this.#run(`set ${store}/${key}`, (db) => db.put(store, value, key));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.#run(`delete ${store}/${key}`, (db) => db.delete(store, key));
  }

  async list<T>(store: StoreName): Promise<T[]> {
    return this.#run(`list ${store}`, async (db) => {
      const values = await db.getAll(store);
      return values as T[];
    });
  }

  /** Closes the connection. The next operation reopens it. */
  async close(): Promise<void> {
    const dbPromise = this.#dbPromise;
    this.#dbPromise = null;
    if (dbPromise) {
      (await dbPromise).close();
    }
  }

  async #run<R>(
    operation: string,
    action: (db: IDBPDatabase<ShitateDB>) => Promise<R>,
  ): Promise<R> {
    try {
      return await action(await this.#open());
    } catch (error: unknown) {
      throw new Error(`Failed to ${operation} in IndexedDB "${this.#dbName}"`, { cause: error });
    }
  }

  #open(): Promise<IDBPDatabase<ShitateDB>> {
    if (!this.#dbPromise) {
      const dbPromise = openDB<ShitateDB>(this.#dbName, DB_VERSION, {
        upgrade(db) {
          for (const name of STORE_NAMES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name);
            }
          }
        },
        // Another tab wants a newer schema: release this connection so it can upgrade.
        blocking: () => {
          void this.close();
        },
        terminated: () => {
          this.#dbPromise = null;
        },
      });
      // Allow a retry on the next call if opening failed.
      dbPromise.catch(() => {
        if (this.#dbPromise === dbPromise) {
          this.#dbPromise = null;
        }
      });
      this.#dbPromise = dbPromise;
    }
    return this.#dbPromise;
  }
}
