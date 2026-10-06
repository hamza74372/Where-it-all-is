// Bank CSV import: prepare (convert + duplicates + rules), commit as one batch, undo a batch.

import { uid } from '../db/db';
import type { CsvMapping, Id, ImportBatch, Rule, Transaction } from '../db/types';
import { convertRows, markDuplicates, tidyDescription, type Draft, type Skipped } from '../lib/csv/convert';
import type { MappingDraft } from '../lib/csv/detect';
import { applyRules } from '../lib/rules';
import type { Undo } from './actions';
import type { Store } from './store';

export interface PreparedItem {
  draft: Draft;
  duplicate: boolean;
  categoryId?: Id;
  note: string;
}

export interface Prepared {
  items: PreparedItem[];
  skipped: Skipped[];
  newCount: number;
  duplicateCount: number;
  needSorting: number;
}

export function prepareImport(store: Store, rows: string[][], mapping: MappingDraft, accountId: Id): Prepared {
  const { drafts, skipped } = convertRows(rows, mapping);
  const dup = markDuplicates(drafts, store.data.transactions, accountId);
  const items = drafts.map((draft, i) => {
    const r = applyRules(draft.description, store.data.rules);
    return { draft, duplicate: dup[i], categoryId: r.categoryId, note: r.renameTo ?? tidyDescription(draft.description) };
  });
  const fresh = items.filter((i) => !i.duplicate);
  return {
    items,
    skipped,
    newCount: fresh.length,
    duplicateCount: items.length - fresh.length,
    // Money coming in (pay, refunds) doesn't need a spending category.
    needSorting: fresh.filter((i) => !i.categoryId && i.draft.amount < 0).length,
  };
}

export async function commitImport(
  store: Store,
  opts: { fileName: string; accountId: Id; mappingId?: Id; items: PreparedItem[] },
): Promise<{ batch: ImportBatch; transactions: Transaction[]; undo: Undo }> {
  const batchId = uid();
  const fresh = opts.items.filter((i) => !i.duplicate);
  const [batch] = await store.upsert('importBatches', [
    { id: batchId, fileName: opts.fileName, importedAt: Date.now(), rowCount: fresh.length, accountId: opts.accountId, mappingId: opts.mappingId },
  ]);
  const transactions = await store.upsert(
    'transactions',
    fresh.map((i) => ({
      id: uid(),
      date: i.draft.date,
      amount: i.draft.amount,
      accountId: opts.accountId,
      categoryId: i.categoryId,
      note: i.note,
      importDescription: i.draft.description,
      source: 'import' as const,
      importBatchId: batchId,
      cleared: true,
    })),
  );
  return { batch, transactions, undo: () => undoImport(store, batchId).then(() => undefined) };
}

/** Remove a whole import (its transactions and the batch record). Returns an undo for the undo. */
export async function undoImport(store: Store, batchId: Id): Promise<Undo> {
  const batch = store.data.importBatches.find((b) => b.id === batchId);
  const txs = store.data.transactions.filter((t) => t.importBatchId === batchId);
  await store.remove('transactions', txs.map((t) => t.id));
  if (batch) await store.remove('importBatches', [batch.id]);
  return async () => {
    if (batch) await store.upsert('importBatches', [batch]);
    await store.upsert('transactions', txs);
  };
}

export async function saveMapping(store: Store, name: string, draft: MappingDraft, existingId?: Id): Promise<CsvMapping> {
  const [m] = await store.upsert('csvMappings', [{ ...draft, id: existingId ?? uid(), name: name.trim() || 'My bank' }]);
  return m;
}

/** "Always do this": a contains-rule that beats the starter rules (lower priority number). */
export async function addRule(store: Store, pattern: string, categoryId: Id): Promise<Rule> {
  const mine = store.data.rules.filter((r) => r.priority < 1000);
  const [rule] = await store.upsert('rules', [
    { id: uid(), matchType: 'contains', pattern, categoryId, priority: 100 + mine.length },
  ]);
  return rule;
}
