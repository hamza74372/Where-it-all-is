// App state: everything loaded into memory at boot (thousands of rows is fine),
// written through to IndexedDB on every change. Components subscribe via useData().

import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { buildDefaultCategories } from '../data/defaults';
import type { DB } from '../db/db';
import { loadSettings } from '../db/settings';
import type { Account, Bill, Category, CsvMapping, Debt, EnvelopeMove, Goal, ImportBatch, Income, Note, Rule, Settings, Transaction } from '../db/types';
import { uid } from '../db/db';
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
    const [accounts, incomes, bills, categories, transactions, goals, debts, notes, envelopeMoves, rules, csvMappings, importBatches] = await Promise.all([
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
    ]);
    categories.sort((a, b) => a.order - b.order);
    return new Store(
      db,
      { settings, accounts, incomes, bills, categories, transactions, goals, debts, notes, envelopeMoves, rules, csvMappings, importBatches },
      previousOpenedAt,
    );
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

  /** Insert or replace rows (one IndexedDB transaction). */
  async upsert<S extends ListStore>(store: S, rows: Array<Omit<Row<S>, 'updatedAt'> & { updatedAt?: number }>): Promise<Row<S>[]> {
    const saved: Row<S>[] = [];
    await this.db.batch([store], (w) => rows.forEach((r) => saved.push(w.put(store, r as never) as Row<S>)));
    const byId = new Map(saved.map((r) => [r.id, r]));
    const list = (this.data[store] as Row<S>[]).map((r) => byId.get(r.id) ?? r);
    const existing = new Set(list.map((r) => r.id));
    for (const r of saved) if (!existing.has(r.id)) list.push(r);
    this.set({ [store]: list } as Partial<AppData>);
    return saved;
  }

  async remove(store: ListStore, ids: string[]): Promise<void> {
    await this.db.batch([store], (w) => ids.forEach((id) => w.delete(store, id)));
    const drop = new Set(ids);
    this.set({ [store]: (this.data[store] as Array<{ id: string }>).filter((r) => !drop.has(r.id)) } as Partial<AppData>);
  }

  /** Wipe all user data stores (used by "Clear examples"). Settings are kept. */
  async clearData(stores: ListStore[]): Promise<void> {
    await this.db.clearAll(stores);
    this.set(Object.fromEntries(stores.map((s) => [s, []])) as Partial<AppData>);
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
