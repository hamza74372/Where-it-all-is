// Bank CSV import: prepare (convert + duplicates + matches to what's already there + transfer
// suggestions + rules), commit as one batch, undo a batch, and the balance check at the end.

import { uid } from '../db/db';
import type { Account, Category, CsvMapping, Id, ImportBatch, ISODate, Rule, Transaction } from '../db/types';
import { convertRows, findDuplicates, matchExistingEntries, statementEnd, tidyDescription, type Draft, type Skipped } from '../lib/csv/convert';
import type { MappingDraft } from '../lib/csv/detect';
import type { Minor } from '../lib/money';
import { applyRules } from '../lib/rules';
import { accountBalance, isBeforeStart } from '../lib/safeToSpend';
import { guessTransferAccount, isTransfer, transferPartners, TRANSFER_WORDS } from '../lib/transfers';
import type { Undo } from './actions';
import type { Store } from './store';

export const BANK_FEES = 'Bank fees';

export interface TransferSuggestion {
  /** The other side, already in the app (same amount, opposite sign, another account, ±3 days). */
  partnerId?: Id;
  /** The other account. For "transfer to/from" wording with no partner yet, the other side is created there. */
  accountId?: Id;
  /** Only confirmed suggestions become transfers. */
  confirmed: boolean;
}

export interface PreparedItem {
  draft: Draft;
  duplicate: boolean;
  /** Existing entry this row is (it's linked instead of added). Cleared by "Unlink". */
  matchId?: Id;
  /** Several existing entries could be this row: the user picks (needs sorting). */
  candidates?: Id[];
  /** The user's pick for a row with candidates. */
  choice?: Id | 'new' | 'skip';
  transfer?: TransferSuggestion;
  categoryId?: Id;
  note: string;
}

export interface Statement {
  /** First and last day in the file, and the bank's balance at the end of the last day. */
  from: ISODate;
  date: ISODate;
  balance: Minor;
}

export interface Prepared {
  items: PreparedItem[];
  skipped: Skipped[];
  /** From the file's balance column, when it has one. */
  statement: Statement | null;
}

export type Resolution = { kind: 'duplicate' } | { kind: 'link'; id: Id } | { kind: 'new' } | { kind: 'skip' } | { kind: 'undecided' };

export function resolutionOf(i: PreparedItem): Resolution {
  if (i.duplicate) return { kind: 'duplicate' };
  if (i.matchId) return { kind: 'link', id: i.matchId };
  if (i.candidates?.length) {
    if (!i.choice) return { kind: 'undecided' };
    if (i.choice === 'new') return { kind: 'new' };
    if (i.choice === 'skip') return { kind: 'skip' };
    return { kind: 'link', id: i.choice };
  }
  return { kind: 'new' };
}

/** A confirmed transfer that can actually be made (it knows the other account). */
export const isConfirmedTransfer = (i: PreparedItem) => !!i.transfer?.confirmed && !!(i.transfer.partnerId || i.transfer.accountId);

export interface Counts {
  newCount: number;
  duplicateCount: number;
  matchedCount: number;
  /** Rows that could match more than one entry and still need the user's pick. */
  undecidedCount: number;
  /** Rows the user chose to leave out. */
  leftOutCount: number;
  feeCount: number;
  transferCount: number;
  needSorting: number;
}

export function countsOf(p: Pick<Prepared, 'items'>): Counts {
  const kinds = p.items.map((i) => resolutionOf(i).kind);
  const fresh = p.items.filter((_, n) => kinds[n] === 'new');
  return {
    newCount: fresh.length,
    duplicateCount: kinds.filter((k) => k === 'duplicate').length,
    matchedCount: kinds.filter((k) => k === 'link').length,
    undecidedCount: kinds.filter((k) => k === 'undecided').length,
    leftOutCount: kinds.filter((k) => k === 'skip').length,
    feeCount: fresh.filter((i) => i.draft.feeOf !== undefined).length,
    transferCount: fresh.filter(isConfirmedTransfer).length,
    // Money coming in (pay, refunds), fees and transfers don't need sorting.
    needSorting: fresh.filter((i) => !i.categoryId && i.draft.amount < 0 && i.draft.feeOf === undefined && !isConfirmedTransfer(i)).length,
  };
}

export function prepareImport(store: Store, rows: string[][], mapping: MappingDraft, accountId: Id): Prepared {
  const { drafts, skipped } = convertRows(rows, mapping);
  const { transactions, accounts } = store.data;
  const dupOf = findDuplicates(drafts, transactions, accountId);
  const matches = matchExistingEntries(drafts, dupOf, transactions, accountId);
  const feesCat = store.data.categories.find((c) => c.name === BANK_FEES && !c.archived);
  const partnersUsed = new Set<Id>();
  const items = drafts.map((draft, i): PreparedItem => {
    const duplicate = !!dupOf[i];
    if (draft.feeOf !== undefined) {
      return { draft, duplicate, categoryId: feesCat?.id, note: `Fee: ${tidyDescription(drafts[draft.feeOf].description)}` };
    }
    const r = applyRules(draft.description, store.data.rules);
    const m = matches[i];
    const item: PreparedItem = {
      draft,
      duplicate,
      categoryId: r.categoryId,
      note: r.renameTo ?? tidyDescription(draft.description),
      ...(m && 'id' in m ? { matchId: m.id } : {}),
      ...(m && 'candidates' in m ? { candidates: m.candidates } : {}),
    };
    // Rows that would be added as new: could this be money moving between your own accounts?
    if (!duplicate && !m) {
      const partner = transferPartners(draft, accountId, transactions, accounts, partnersUsed)[0];
      if (partner) {
        partnersUsed.add(partner.id);
        item.transfer = { partnerId: partner.id, accountId: partner.accountId, confirmed: false };
      } else if (TRANSFER_WORDS.test(draft.description) && accounts.some((a) => !a.archived && a.id !== accountId)) {
        item.transfer = { accountId: guessTransferAccount(draft.description, accountId, accounts), confirmed: false };
      }
    }
    return item;
  });
  return { items, skipped, statement: statementEnd(drafts) };
}

async function ensureBankFeesCategory(store: Store): Promise<Category> {
  const existing = store.data.categories.find((c) => c.name === BANK_FEES);
  if (existing && !existing.archived) return existing;
  const [cat] = await store.upsert('categories', [
    existing
      ? { ...existing, archived: false }
      : { id: uid(), name: BANK_FEES, icon: 'landmark', color: '#b7b2c9', order: store.data.categories.length, archived: false },
  ]);
  return cat;
}

export async function commitImport(
  store: Store,
  opts: { fileName: string; accountId: Id; mappingId?: Id; items: PreparedItem[] },
): Promise<{ batch: ImportBatch; transactions: Transaction[]; matched: Transaction[]; transfers: number; undo: Undo }> {
  const batchId = uid();
  const items = opts.items;
  const res = items.map(resolutionOf); // 'undecided' rows are left out rather than guessed
  const needsFees = items.some((i, n) => res[n].kind === 'new' && i.draft.feeOf !== undefined);
  const feesCat = needsFees ? await ensureBankFeesCategory(store) : undefined;

  // Each draft's resulting transaction id: a new one, or the existing entry it is.
  const resultId = res.map((r) => (r.kind === 'new' ? uid() : r.kind === 'link' ? r.id : undefined));

  const fresh: Array<Omit<Transaction, 'updatedAt'>> = [];
  const partnerUpdates: Transaction[] = [];
  items.forEach((i, idx) => {
    if (res[idx].kind !== 'new') return;
    const isFee = i.draft.feeOf !== undefined;
    const transfer = isConfirmedTransfer(i) ? i.transfer! : undefined;
    const transferId = transfer ? uid() : undefined;
    fresh.push({
      id: resultId[idx]!,
      date: i.draft.date,
      amount: i.draft.amount,
      accountId: opts.accountId,
      categoryId: isFee ? feesCat?.id : transfer ? undefined : i.categoryId,
      note: i.note,
      importDescription: i.draft.description,
      source: 'import',
      importBatchId: batchId,
      linkedTxId: isFee ? resultId[i.draft.feeOf!] : undefined,
      transferId,
      cleared: true,
    });
    if (!transfer) return;
    const partner = transfer.partnerId ? store.data.transactions.find((t) => t.id === transfer.partnerId) : undefined;
    if (partner) {
      partnerUpdates.push({ ...partner, transferId, categoryId: undefined });
    } else {
      // No other side in the app yet: create it as part of this import (undo removes it too).
      fresh.push({
        id: uid(), date: i.draft.date, amount: -i.draft.amount, accountId: transfer.accountId!, note: i.note,
        source: 'transfer', transferId, importBatchId: batchId, cleared: false,
      });
    }
  });

  // Existing entries are linked, not duplicated: they keep the user's note, date and category.
  const linked = items.flatMap((i, idx) => {
    const r = res[idx];
    if (r.kind !== 'link') return [];
    const t = store.data.transactions.find((x) => x.id === r.id);
    return t ? [{ ...t, matchedBatchId: batchId, importDescription: i.draft.description, importDate: i.draft.date, cleared: true }] : [];
  });

  const own = fresh.filter((t) => t.accountId === opts.accountId);
  const [batch] = await store.upsert('importBatches', [
    { id: batchId, fileName: opts.fileName, importedAt: Date.now(), rowCount: own.length, accountId: opts.accountId, mappingId: opts.mappingId },
  ]);
  const saved = await store.upsert('transactions', fresh);
  const matched = linked.length ? await store.upsert('transactions', linked) : [];
  if (partnerUpdates.length) await store.upsert('transactions', partnerUpdates);
  return {
    batch,
    transactions: saved.filter((t) => t.accountId === opts.accountId),
    matched,
    transfers: own.filter((t) => t.transferId).length,
    undo: () => undoImport(store, batchId).then(() => undefined),
  };
}

/**
 * Remove a whole import: its transactions (including transfer sides it created) and the batch
 * record. Entries it was linked to stay, unlinked; entries it paired as transfers go back to
 * normal. Returns an undo for the undo.
 */
export async function undoImport(store: Store, batchId: Id): Promise<Undo> {
  const batch = store.data.importBatches.find((b) => b.id === batchId);
  const added = store.data.transactions.filter((t) => t.importBatchId === batchId);
  const addedIds = new Set(added.map((t) => t.id));
  const linked = store.data.transactions.filter((t) => t.matchedBatchId === batchId);
  const transferIds = new Set(added.map((t) => t.transferId).filter(Boolean));
  const partners = store.data.transactions.filter((t) => !addedIds.has(t.id) && !!t.transferId && transferIds.has(t.transferId));
  await store.remove('transactions', [...addedIds]);
  const restored = [
    ...linked.map(({ matchedBatchId: _m, importDescription: _d, importDate: _i, ...rest }) => ({ ...rest, cleared: false })),
    ...partners.map(({ transferId: _t, ...rest }) => rest),
  ];
  if (restored.length) await store.upsert('transactions', restored);
  if (batch) await store.remove('importBatches', [batch.id]);
  return async () => {
    if (batch) await store.upsert('importBatches', [batch]);
    await store.upsert('transactions', [...added, ...linked, ...partners]);
  };
}

/** Plain description of an existing entry, for "Which one is it?" and the linked list. */
export function entryKind(t: Transaction): string {
  if (isTransfer(t)) return 'transfer';
  switch (t.source) {
    case 'bill':
      return 'bill you marked paid';
    case 'income':
      return 'pay you confirmed';
    case 'import':
      return 'imported before';
    default:
      return t.amount > 0 ? 'money in you added' : 'you logged';
  }
}

/** The same, as a phrase for a sentence: "Lunch … — something you logged, not on this statement". */
export function entryNoun(t: Transaction): string {
  if (isTransfer(t)) return 'a transfer';
  switch (t.source) {
    case 'bill':
      return 'a bill you marked paid';
    case 'income':
      return 'pay you confirmed';
    case 'import':
      return 'a row imported before';
    default:
      return t.amount > 0 ? 'money in you added' : 'something you logged';
  }
}

/** "Line it up with the bank": one adjustment for exactly the reported difference, on the report's day. */
export async function addStatementAdjustment(store: Store, accountId: Id, report: BalanceReport): Promise<{ difference: Minor; undo: Undo }> {
  const account = store.data.accounts.find((a) => a.id === accountId)!;
  const gap = report.bank - report.app; // as the bank shows it
  const amount = account.type === 'credit' ? -gap : gap;
  if (amount === 0) return { difference: 0, undo: async () => {} };
  const [tx] = await store.upsert('transactions', [
    { id: uid(), date: report.date, amount, accountId, note: 'Balance adjustment', source: 'adjustment', cleared: true },
  ]);
  return { difference: amount, undo: () => store.remove('transactions', [tx.id]) };
}

export interface BalanceReport {
  /** As the bank shows it (amount owed, positive, for a credit card). */
  bank: Minor;
  app: Minor;
  date: ISODate;
  /** In the app, inside the statement's dates, but not on the statement. */
  notOnStatement: Transaction[];
  /** Statement rows from before the account's start date (inside the starting balance). */
  beforeStart: number;
  /** Rows the user left out, or didn't decide on. */
  leftOut: number;
}

/**
 * After importing a file with a balance column: the app's balance on the statement's last day
 * against the bank's, and what might explain a difference.
 */
export function balanceReport(store: Store, accountId: Id, prepared: Prepared): BalanceReport | null {
  const st = prepared.statement;
  const account = store.data.accounts.find((a) => a.id === accountId);
  if (!st || !account) return null;
  const bank = account.type === 'credit' ? Math.abs(st.balance) : st.balance;
  // Compared on the statement's last day — or the day you started, if that's later (the app knows
  // nothing before it). Linked entries count on the bank's date: a coffee typed on the 16th that
  // the bank posted on the 15th is in both.
  const date = account.openingDate && account.openingDate > st.date ? account.openingDate : st.date;
  const own = store.data.transactions.filter((t) => t.accountId === accountId && !isBeforeStart(account, t));
  const raw = account.openingBalance + own.filter((t) => (t.importDate ?? t.date) <= date).reduce((s, t) => s + t.amount, 0);
  const app = account.type === 'credit' ? -raw : raw;
  const notOnStatement = store.data.transactions
    .filter(
      (t) =>
        t.accountId === accountId &&
        t.date >= st.from &&
        t.date <= date &&
        t.source !== 'import' &&
        t.source !== 'adjustment' &&
        !t.matchedBatchId &&
        !isBeforeStart(account, t),
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const kinds = prepared.items.map((i) => resolutionOf(i).kind);
  return {
    bank,
    app,
    date,
    notOnStatement,
    beforeStart: prepared.items.filter((i, n) => kinds[n] === 'new' && isBeforeStart(account, i.draft)).length,
    leftOut: kinds.filter((k) => k === 'skip' || k === 'undecided').length,
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

/**
 * Things to tell the user before importing: rows from before the account's opening date
 * (kept for history, don't move the balance) and rows dated after today (usually a sign the
 * day and month were read the wrong way round).
 */
export function importNotes(p: Prepared, account: Account | undefined, today: ISODate): { beforeStart: number; future: number } {
  const fresh = p.items.filter((i) => !i.duplicate && !i.matchId);
  return {
    beforeStart: fresh.filter((i) => isBeforeStart(account, i.draft)).length,
    future: p.items.filter((i) => !i.duplicate && i.draft.date > today).length,
  };
}

/**
 * A gap bigger than any single transaction in the import is more likely an import mistake
 * (wrong account, wrong date format, a missing file) than a stray pending payment.
 */
export function isBigGap(difference: Minor, importedAmounts: Minor[]): boolean {
  if (difference === 0) return false;
  const biggest = importedAmounts.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
  return Math.abs(difference) > biggest;
}
