// IndexedDB schema + ordered migrations. To change the schema:
//   1. append a migration to MIGRATIONS (never edit an old one),
//   2. SCHEMA_VERSION follows automatically.
// Each migration runs inside the versionchange transaction, in order, only for
// versions newer than what the user's database already has.

import type { StoreName } from './types';

/**
 * The demo keeps its data apart: on the website the demo and the full app share one origin, and
 * trying the demo must never touch a real budget.
 */
export const DB_NAME = typeof __DEMO__ !== 'undefined' && __DEMO__ ? 'where-it-all-is-demo' : 'where-it-all-is';

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

function createStores(db: IDBDatabase, specs: StoreSpec[]) {
  for (const spec of specs) {
    const store = db.createObjectStore(spec.name, { keyPath: 'id' });
    for (const [name, keyPath, unique] of spec.indexes ?? []) {
      store.createIndex(name, keyPath, { unique: !!unique });
    }
  }
}

const V2_STORES: StoreSpec[] = [{ name: 'envelopeMoves', indexes: [['month', 'month']] }];
const V3_STORES: StoreSpec[] = [{ name: 'tombstones', indexes: [['deletedAt', 'deletedAt']] }, { name: 'partner' }];

export const MIGRATIONS: Migration[] = [
  // v1 — initial schema
  (db) => createStores(db, V1_STORES),
  // v2 — "move money" between envelopes (Phase 3)
  (db) => createStores(db, V2_STORES),
  // v3 — deletion tombstones (so merges don't bring deleted things back) and the partner's
  // read-only shared view, kept apart from the user's own data (Phase 5)
  (db) => createStores(db, V3_STORES),
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export const ALL_STORES: StoreName[] = [...V1_STORES, ...V2_STORES, ...V3_STORES].map((s) => s.name);

/** Everything that belongs to the user: what a backup contains and what Replace/Merge touch. */
export const BACKUP_STORES: StoreName[] = ALL_STORES.filter((s) => s !== 'partner');
