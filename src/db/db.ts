// Tiny promise wrapper over IndexedDB. Typed by store name; stamps updatedAt on write.

import { DB_NAME, MIGRATIONS, SCHEMA_VERSION } from './schema';
import type { StoreMap, StoreName } from './types';

type WithoutStamp<T> = Omit<T, 'updatedAt'> & { updatedAt?: number };

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let failure: unknown = null;
    tx.oncomplete = () => resolve();
    // A failed request bubbles here before tx.error is set; remember the request's error.
    tx.onerror = (e) => {
      failure ??= (e.target as IDBRequest | null)?.error ?? tx.error;
    };
    tx.onabort = () =>
      reject(failure ?? tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

export function openDatabase(name = DB_NAME, factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, SCHEMA_VERSION);
    open.onupgradeneeded = (e) => {
      const db = open.result;
      const tx = open.transaction!;
      for (let v = e.oldVersion; v < SCHEMA_VERSION; v++) MIGRATIONS[v](db, tx);
    };
    open.onsuccess = () => {
      const db = open.result;
      // Another tab upgraded the schema: close so it can proceed; reload picks up new code.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('Please close other tabs of this app and try again.'));
  });
}

export class DB {
  constructor(readonly idb: IDBDatabase) {}

  static async open(name?: string, factory?: IDBFactory): Promise<DB> {
    return new DB(await openDatabase(name, factory));
  }

  close(): void {
    this.idb.close();
  }

  async get<S extends StoreName>(store: S, id: string): Promise<StoreMap[S] | undefined> {
    const tx = this.idb.transaction(store, 'readonly');
    return req(tx.objectStore(store).get(id) as IDBRequest<StoreMap[S] | undefined>);
  }

  async all<S extends StoreName>(store: S): Promise<StoreMap[S][]> {
    const tx = this.idb.transaction(store, 'readonly');
    return req(tx.objectStore(store).getAll() as IDBRequest<StoreMap[S][]>);
  }

  async byIndex<S extends StoreName>(
    store: S,
    index: string,
    query: IDBValidKey | IDBKeyRange,
  ): Promise<StoreMap[S][]> {
    const tx = this.idb.transaction(store, 'readonly');
    return req(tx.objectStore(store).index(index).getAll(query) as IDBRequest<StoreMap[S][]>);
  }

  async count<S extends StoreName>(store: S): Promise<number> {
    const tx = this.idb.transaction(store, 'readonly');
    return req(tx.objectStore(store).count());
  }

  /** Insert or replace one record. Stamps updatedAt unless `keepStamp` (used by merge/restore). */
  async put<S extends StoreName>(
    store: S,
    value: WithoutStamp<StoreMap[S]>,
    keepStamp = false,
  ): Promise<StoreMap[S]> {
    const rec = stamp(value, keepStamp) as StoreMap[S];
    const tx = this.idb.transaction(store, 'readwrite');
    tx.objectStore(store).put(rec);
    await done(tx);
    return rec;
  }

  async delete(store: StoreName, id: string): Promise<void> {
    const tx = this.idb.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    await done(tx);
  }

  /**
   * Atomic multi-store write. Everything in `fn` commits together or not at all.
   * Don't await non-IDB promises inside `fn` — the transaction would auto-commit.
   */
  async batch(stores: StoreName[], fn: (w: BatchWriter) => void): Promise<void> {
    const tx = this.idb.transaction(stores, 'readwrite');
    fn(new BatchWriter(tx));
    await done(tx);
  }

  async clearAll(stores: StoreName[]): Promise<void> {
    await this.batch(stores, (w) => stores.forEach((s) => w.clear(s)));
  }
}

export class BatchWriter {
  constructor(private tx: IDBTransaction) {}
  put<S extends StoreName>(store: S, value: WithoutStamp<StoreMap[S]>, keepStamp = false): StoreMap[S] {
    const rec = stamp(value, keepStamp) as StoreMap[S];
    this.tx.objectStore(store).put(rec);
    return rec;
  }
  delete(store: StoreName, id: string): void {
    this.tx.objectStore(store).delete(id);
  }
  clear(store: StoreName): void {
    this.tx.objectStore(store).clear();
  }
}

function stamp<T extends { updatedAt?: number }>(value: T, keep: boolean): T & { updatedAt: number } {
  if (keep && typeof value.updatedAt === 'number') return value as T & { updatedAt: number };
  return { ...value, updatedAt: Date.now() };
}

/** Random id that works without a secure context (file:// on some browsers). */
export function uid(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 20);
}
