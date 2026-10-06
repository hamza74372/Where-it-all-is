// Bank CSV import: prepare (convert + duplicates + manual matches + rules), commit as one batch,
// undo a batch, and the optional balance check at the end.

import { uid } from '../db/db';
import type { Category, CsvMapping, Id, ImportBatch, ISODate, Rule, Transaction } from '../db/types';
import { convertRows, markDuplicates, matchManualEntries, tidyDescription, type Draft, type Skipped } from '../lib/csv/convert';
import type { MappingDraft } from '../lib/csv/detect';
import type { Minor } from '../lib/money';
import { applyRules } from '../lib/rules';
import { accountBalance } from '../lib/safeToSpend';
import type { Undo } from './actions';
import type { Store } from './store';

export const BANK_FEES = 'Bank fees';

export interface PreparedItem {
  draft: Draft;
  duplicate: boolean;
  /** Manual entry this row matches (it's linked instead of added). Cleared by "Unlink". */
  matchId?: Id;
  categoryId?: Id;
  note: string;
}

export interface Prepared {
  items: PreparedItem[];
  skipped: Skipped[];
}

export interface Counts {
  newCount: number;
  duplicateCount: number;
  matchedCount: number;
  feeCount: number;
  needSorting: number;
}

export function countsOf(p: Prepared): Counts {
  const fresh = p.items.filter((i) => !i.duplicate && !i.matchId);
  return {
    newCount: fresh.length,
    duplicateCount: p.items.filter((i) => i.duplicate).length,
    matchedCount: p.items.filter((i) => !i.duplicate && i.matchId).length,
    feeCount: fresh.filter((i) => i.draft.feeOf !== undefined).length,
    // Money coming in (pay, refunds) and fees don't need sorting.
    needSorting: fresh.filter((i) => !i.categoryId && i.draft.amount < 0 && i.draft.feeOf === undefined).length,
  };
}

export function prepareImport(store: Store, rows: string[][], mapping: MappingDraft, accountId: Id): Prepared {
  const { drafts, skipped } = convertRows(rows, mapping);
  const dup = markDuplicates(drafts, store.data.transactions, accountId);
  const matches = matchManualEntries(drafts, dup, store.data.transactions, accountId);
  const feesCat = store.data.categories.find((c) => c.name === BANK_FEES && !c.archived);
  const items = drafts.map((draft, i) => {
    if (draft.feeOf !== undefined) {
      return { draft, duplicate: dup[i], categoryId: feesCat?.id, note: `Fee: ${tidyDescription(drafts[draft.feeOf].description)}` };
    }
    const r = applyRules(draft.description, store.data.rules);
    return { draft, duplicate: dup[i], matchId: matches[i], categoryId: r.categoryId, note: r.renameTo ?? tidyDescription(draft.description) };
  });
  return { items, skipped };
}

async function ensureBankFeesCategory(store: Store): Promise<Category> {
  const existing = store.data.categories.find((c) => c.name === BANK_FEES);
  if (existing && !existing.archived) return existing;
  const [cat] = await store.upsert('categories', [
    existing
      ? { ...existing, archived: false }
      : { id: uid(), name: BANK_FEES, emoji: '🏦', color: '#b7b2c9', order: store.data.categories.length, archived: false },
  ]);
  return cat;
}

export async function commitImport(
  store: Store,
  opts: { fileName: string; accountId: Id; mappingId?: Id; items: PreparedItem[] },
): Promise<{ batch: ImportBatch; transactions: Transaction[]; matched: Transaction[]; undo: Undo }> {
  const batchId = uid();
  const items = opts.items;
  const needsFees = items.some((i) => !i.duplicate && i.draft.feeOf !== undefined);
  const feesCat = needsFees ? await ensureBankFeesCategory(store) : undefined;

  // Each draft's resulting transaction id: a new one, or the manual entry it matched.
  const resultId = items.map((i) => (i.duplicate ? undefined : i.matchId ?? uid()));

  const fresh = items.flatMap((i, idx) => {
    if (i.duplicate || i.matchId) return [];
    const isFee = i.draft.feeOf !== undefined;
    return [{
      id: resultId[idx]!,
      date: i.draft.date,
      amount: i.draft.amount,
      accountId: opts.accountId,
      categoryId: isFee ? feesCat?.id : i.categoryId,
      note: i.note,
      importDescription: i.draft.description,
      source: 'import' as const,
      importBatchId: batchId,
      linkedTxId: isFee ? resultId[i.draft.feeOf!] : undefined,
      cleared: true,
    }];
  });

  // Matched manual entries are linked, not duplicated: they keep the user's note, date and category.
  const matchedIds = new Set(items.filter((i) => !i.duplicate && i.matchId).map((i) => i.matchId!));
  const linked = store.data.transactions
    .filter((t) => matchedIds.has(t.id))
    .map((t) => {
      const item = items.find((i) => i.matchId === t.id)!;
      return { ...t, matchedBatchId: batchId, importDescription: item.draft.description, importDate: item.draft.date, cleared: true };
    });

  const [batch] = await store.upsert('importBatches', [
    { id: batchId, fileName: opts.fileName, importedAt: Date.now(), rowCount: fresh.length, accountId: opts.accountId, mappingId: opts.mappingId },
  ]);
  const transactions = await store.upsert('transactions', fresh);
  const matched = linked.length ? await store.upsert('transactions', linked) : [];
  return { batch, transactions, matched, undo: () => undoImport(store, batchId).then(() => undefined) };
}

/**
 * Remove a whole import: its transactions and the batch record. Manual entries it was matched
 * to stay, unlinked. Returns an undo for the undo.
 */
export async function undoImport(store: Store, batchId: Id): Promise<Undo> {
  const batch = store.data.importBatches.find((b) => b.id === batchId);
  const added = store.data.transactions.filter((t) => t.importBatchId === batchId);
  const linked = store.data.transactions.filter((t) => t.matchedBatchId === batchId);
  await store.remove('transactions', added.map((t) => t.id));
  if (linked.length) {
    await store.upsert(
      'transactions',
      linked.map(({ matchedBatchId: _m, importDescription: _d, importDate: _i, ...rest }) => ({ ...rest, cleared: false })),
    );
  }
  if (batch) await store.remove('importBatches', [batch.id]);
  return async () => {
    if (batch) await store.upsert('importBatches', [batch]);
    await store.upsert('transactions', [...added, ...linked]);
  };
}

export async function saveMapping(store: Store, name: string, draft: MappingDraft, existingId?: Id): Promise<CsvMapping> {
  const [m] = await store.upsert('csvMappings', [{ ...draft, id: existingId ?? uid(), name: name.trim() || 'My bank' }]);
  return m;
}

/** "Always do this": a contains-rule that beats the starter rules (lower priority number). */
export async function addRule(store: Store, pattern: string, categoryId: Id): Promise<Rule> {
  const mine = store.data.rules.filter((r) => r.priority < 1000);
  const [rule] = await store.upsert('rules', [{ id: uid(), matchType: 'contains', pattern, categoryId, priority: 100 + mine.length }]);
  return rule;
}

/**
 * The app's balance for an account as the bank would show it: what's in it for everyday
 * accounts, what's owed (positive) for credit cards.
 */
export function bankStyleBalance(store: Store, accountId: Id, today: ISODate): Minor {
  const account = store.data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  const bal = accountBalance(account, store.data.transactions, today);
  return account.type === 'credit' ? -bal : bal;
}

/**
 * Bring the app in line with the bank: one "Balance adjustment" transaction for the difference.
 * `bankBalance` is as the bank shows it (amount owed for a credit card). Undoable.
 */
export async function addBalanceAdjustment(store: Store, accountId: Id, bankBalance: Minor, today: ISODate): Promise<{ difference: Minor; undo: Undo }> {
  const account = store.data.accounts.find((a) => a.id === accountId)!;
  const current = accountBalance(account, store.data.transactions, today);
  const target = account.type === 'credit' ? -bankBalance : bankBalance;
  const difference = target - current;
  if (difference === 0) return { difference, undo: async () => {} };
  const [tx] = await store.upsert('transactions', [
    { id: uid(), date: today, amount: difference, accountId, note: 'Balance adjustment', source: 'adjustment', cleared: true },
  ]);
  return { difference, undo: () => store.remove('transactions', [tx.id]) };
}
