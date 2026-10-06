// App state: everything loaded into memory at boot (thousands of rows is fine),
// written through to IndexedDB on every change. Components subscribe via useData().
//
// Deletions leave a tombstone (kept 90 days) so a merge with another device's backup doesn't
// bring deleted things back; saving a row again clears its tombstone.

import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { buildDefaultCategories } from '../data/defaults';
import type { DB } from '../db/db';
import { uid } from '../db/db';
import { BACKUP_STORES } from '../db/schema';
import { defaultSettings, loadSettings } from '../db/settings';
import type {
  Account, Bill, Category, CsvMapping, Debt, EnvelopeMove, Goal, ImportBatch, Income, Note, PartnerShare, Rule, Settings, StoreName, Transaction,
} from '../db/types';
import type { Snapshot } from '../lib/backup/format';
import { TOMBSTONE_DAYS } from '../lib/backup/merge';
import { DemoLimitError, demoRemaining } from '../lib/demo';
import { buildStarterRules } from '../lib/rules';

export interface AppData {
  settings: Settings;
  accounts: Account[];
  incomes: Income[];
  bills: Bill[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
  debts: Debt[];
  notes: Note[];
  envelopeMoves: EnvelopeMove[];
  rules: Rule[];
  csvMappings: CsvMapping[];
  importBatches: ImportBatch[];
  /** A partner's read-only shared view, if one has been opened. Never mixed with the lists above. */
  partner: PartnerShare | null;
}

export type ListStore =
  | 'accounts'
  | 'incomes'
  | 'bills'
  | 'categories'
  | 'transactions'
  | 'goals'
  | 'debts'
  | 'notes'
  | 'envelopeMoves'
  | 'rules'
  | 'csvMappings'
  | 'importBatches';
type Row<S extends ListStore> = AppData[S][number];

export const LIST_STORES: ListStore[] = [
  'accounts', 'incomes', 'bills', 'categories', 'transactions', 'goals', 'debts', 'notes', 'envelopeMoves', 'rules', 'csvMappings', 'importBatches',
];

const tombId = (store: StoreName, id: string) => `${store}:${id}`;

async function readAll(db: DB, settings: Settings): Promise<AppData> {
  const [accounts, incomes, bills, categories, transactions, goals, debts, notes, envelopeMoves, rules, csvMappings, importBatches, partner] =
    await Promise.all([
      db.all('accounts'),
      db.all('incomes'),
      db.all('bills'),
      db.all('categories'),
      db.all('transactions'),
      db.all('goals'),
      db.all('debts'),
      db.all('notes'),
      db.all('envelopeMoves'),
      db.all('rules'),
      db.all('csvMappings'),
      db.all('importBatches'),
      db.get('partner', 'partner'),
    ]);
  categories.sort((a, b) => a.order - b.order);
  return { settings, accounts, incomes, bills, categories, transactions, goals, debts, notes, envelopeMoves, rules, csvMappings, importBatches, partner: partner ?? null };
}

export class Store {
  private listeners = new Set<() => void>();

  private constructor(
    readonly db: DB,
    public data: AppData,
    /** lastOpenedAt from the previous visit (for "while you were away"). */
    readonly previousOpenedAt: number | null,
  ) {}

  static async load(db: DB): Promise<Store> {
    let { settings, previousOpenedAt } = await loadSettings(db);
    if (!settings.seeded) {
      if ((await db.count('categories')) === 0) {
        await db.batch(['categories'], (w) => buildDefaultCategories().forEach((c) => w.put('categories', c)));
      }
      settings = await db.put('settings', { ...settings, seeded: true });
    }
    if (!settings.rulesSeeded) {
      const cats = await db.all('categories');
      await db.batch(['rules'], (w) => buildStarterRules(cats, uid).forEach((r) => w.put('rules', r)));
      settings = await db.put('settings', { ...settings, rulesSeeded: true });
    }
    // Forget deletion records older than 90 days.
    const cutoff = Date.now() - TOMBSTONE_DAYS * 86_400_000;
    const old = await db.byIndex('tombstones', 'deletedAt', IDBKeyRange.upperBound(cutoff, true));
    if (old.length) await db.batch(['tombstones'], (w) => old.forEach((t) => w.delete('tombstones', t.id)));
    return new Store(db, await readAll(db, settings), previousOpenedAt);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<AppData>): void {
    this.data = { ...this.data, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  async saveSettings(patch: Partial<Settings>): Promise<Settings> {
    const settings = await this.db.put('settings', { ...this.data.settings, ...patch });
    this.set({ settings });
    return settings;
  }

  /** Insert or replace rows (one IndexedDB transaction). Clears any tombstone for them. */
  async upsert<S extends ListStore>(store: S, rows: Array<Omit<Row<S>, 'updatedAt'> & { updatedAt?: number }>): Promise<Row<S>[]> {
    if (store === 'transactions' && __DEMO__) {
      const have = new Set(this.data.transactions.map((t) => t.id));
      const adding = rows.filter((r) => !have.has(r.id)).length;
      if (adding > demoRemaining(this.data.transactions.length)) throw new DemoLimitError();
    }
    const saved: Row<S>[] = [];
    await this.db.batch([store, 'tombstones'], (w) =>
      rows.forEach((r) => {
        saved.push(w.put(store, r as never) as Row<S>);
        w.delete('tombstones', tombId(store, r.id));
      }),
    );
    const byId = new Map(saved.map((r) => [r.id, r]));
    const list = (this.data[store] as Row<S>[]).map((r) => byId.get(r.id) ?? r);
    const existing = new Set(list.map((r) => r.id));
    for (const r of saved) if (!existing.has(r.id)) list.push(r);
    this.set({ [store]: list } as Partial<AppData>);
    return saved;
  }

  /** Delete rows, leaving a tombstone for each so merges don't resurrect them. */
  async remove(store: ListStore, ids: string[]): Promise<void> {
    const now = Date.now();
    await this.db.batch([store, 'tombstones'], (w) =>
      ids.forEach((id) => {
        w.delete(store, id);
        w.put('tombstones', { id: tombId(store, id), store, rowId: id, deletedAt: now, updatedAt: now }, true);
      }),
    );
    const drop = new Set(ids);
    this.set({ [store]: (this.data[store] as Array<{ id: string }>).filter((r) => !drop.has(r.id)) } as Partial<AppData>);
  }

  /** Wipe all user data stores (used by "Clear examples"). Settings are kept. */
  async clearData(stores: ListStore[]): Promise<void> {
    await this.db.clearAll([...stores, 'tombstones']);
    this.set(Object.fromEntries(stores.map((s) => [s, []])) as Partial<AppData>);
  }

  /** Everything that belongs to the user, straight from the database (for backups and merges). */
  async exportSnapshot(): Promise<Snapshot> {
    const out: Snapshot = {};
    for (const s of BACKUP_STORES) out[s] = (await this.db.all(s)) as unknown as Snapshot[StoreName];
    return out;
  }

  /** Replace all of the user's data with a snapshot (restore, merge result, or undo). Atomic. */
  async replaceAll(snapshot: Snapshot): Promise<void> {
    await this.db.batch(BACKUP_STORES, (w) => {
      for (const s of BACKUP_STORES) {
        w.clear(s);
        for (const row of snapshot[s] ?? []) w.put(s, row as never, true);
      }
    });
    await this.reload();
  }

  /**
   * Re-read everything from the database (after a replace). Settings are read as stored — no
   * "last opened" stamp — so a restore or undo leaves the data exactly as it was.
   */
  async reload(): Promise<void> {
    const stored = await this.db.get('settings', 'main');
    const settings = stored ? { ...defaultSettings(), ...stored } : (await loadSettings(this.db)).settings;
    this.set(await readAll(this.db, settings));
  }

  async setPartner(share: Omit<PartnerShare, 'updatedAt'> | null): Promise<void> {
    if (share) {
      const saved = await this.db.put('partner', share);
      this.set({ partner: saved });
    } else {
      await this.db.delete('partner', 'partner');
      this.set({ partner: null });
    }
  }
}

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
}

/** Current data; re-renders on every store change. */
export function useData(): AppData {
  const store = useStore();
  const [data, setData] = useState(store.data);
  useEffect(() => {
    setData(store.data);
    return store.subscribe(() => setData(store.data));
  }, [store]);
  return data;
}
