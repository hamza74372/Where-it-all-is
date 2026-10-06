// IndexedDB schema + ordered migrations. To change the schema:
//   1. append a migration to MIGRATIONS (never edit an old one),
//   2. SCHEMA_VERSION follows automatically.
// Each migration runs inside the versionchange transaction, in order, only for
// versions newer than what the user's database already has.

import type { StoreName } from './types';

export const DB_NAME = 'where-it-all-is';

type Migration = (db: IDBDatabase, tx: IDBTransaction) => void;

interface StoreSpec {
  name: StoreName;
  indexes?: Array<[name: string, keyPath: string | string[], unique?: boolean]>;
}

const V1_STORES: StoreSpec[] = [
  { name: 'settings' },
  { name: 'accounts' },
  { name: 'incomes' },
  { name: 'bills' },
  { name: 'categories' },
  {
    name: 'transactions',
    indexes: [
      ['date', 'date'],
      ['accountId', 'accountId'],
      ['categoryId', 'categoryId'],
      ['importBatchId', 'importBatchId'],
      ['billId', 'billId'],
    ],
  },
  { name: 'debts' },
  { name: 'goals' },
  { name: 'rules', indexes: [['priority', 'priority']] },
  { name: 'importBatches' },
  { name: 'csvMappings' },
  { name: 'notes', indexes: [['month', 'month', true]] },
  { name: 'events', indexes: [['ts', 'ts']] },
];

export const MIGRATIONS: Migration[] = [
  // v1 — initial schema
  (db) => {
    for (const spec of V1_STORES) {
      const store = db.createObjectStore(spec.name, { keyPath: 'id' });
      for (const [name, keyPath, unique] of spec.indexes ?? []) {
        store.createIndex(name, keyPath, { unique: !!unique });
      }
    }
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export const ALL_STORES: StoreName[] = V1_STORES.map((s) => s.name);
