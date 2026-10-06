// User actions. Each returns an `undo` so the UI can offer an 8-second Undo toast.

import { buildDefaultCategories, buildExampleData, COMMON_BILLS } from '../data/defaults';
import { uid } from '../db/db';
import type { Account, Bill, Category, Id, Income, ISODate, Schedule, Transaction } from '../db/types';
import { accountBalance } from '../lib/safeToSpend';
import type { Minor } from '../lib/money';
import { LIST_STORES, type AppData, type ListStore, type Store } from './store';

export type Undo = () => Promise<void>;

/** Save one row; undo restores the previous version (or removes it if it was new). */
export async function saveWithUndo<S extends ListStore>(
  store: Store,
  name: S,
  row: Omit<AppData[S][number], 'updatedAt'> & { updatedAt?: number },
): Promise<Undo> {
  const before = (store.data[name] as Array<AppData[S][number]>).find((r) => r.id === row.id);
  await store.upsert(name, [row]);
  return async () => {
    if (before) await store.upsert(name, [before]);
    else await store.remove(name, [row.id]);
  };
}

/** Remove one row; undo puts it back exactly as it was. */
export async function removeWithUndo<S extends ListStore>(store: Store, name: S, row: AppData[S][number]): Promise<Undo> {
  await store.remove(name, [row.id]);
  return async () => void (await store.upsert(name, [row]));
}

/** The account quick log spends from: the saved default, else the first everyday account. */
export function defaultAccount(store: Store): Account | undefined {
  const { accounts, settings } = store.data;
  const live = accounts.filter((a) => !a.archived);
  return (
    live.find((a) => a.id === settings.defaultAccountId) ??
    live.find((a) => a.includeInSafeToSpend && a.type !== 'credit') ??
    live[0]
  );
}

export function categoryByName(categories: Category[], name?: string): Category | undefined {
  return name ? categories.find((c) => !c.archived && c.name.toLowerCase() === name.toLowerCase()) : undefined;
}

export async function logTransaction(
  store: Store,
  t: { amount: Minor; direction: 'out' | 'in'; date: ISODate; categoryId?: Id; note: string; accountId?: Id },
): Promise<{ tx: Transaction; undo: Undo }> {
  const accountId = t.accountId ?? defaultAccount(store)?.id;
  if (!accountId) throw new Error('Add an account first.');
  const [tx] = await store.upsert('transactions', [
    {
      id: uid(),
      date: t.date,
      amount: t.direction === 'out' ? -Math.abs(t.amount) : Math.abs(t.amount),
      accountId,
      categoryId: t.categoryId,
      note: t.note,
      source: 'manual',
      cleared: false,
    },
  ]);
  return { tx, undo: () => store.remove('transactions', [tx.id]) };
}

export async function deleteTransactions(store: Store, txs: Transaction[]): Promise<Undo> {
  // Transfers come in pairs: deleting one side deletes both.
  const pairIds = new Set(txs.map((t) => t.transferId).filter(Boolean));
  const all = store.data.transactions.filter((t) => txs.some((x) => x.id === t.id) || (t.transferId && pairIds.has(t.transferId)));
  await store.remove('transactions', all.map((t) => t.id));
  return async () => void (await store.upsert('transactions', all));
}

/** What paying this bill occurrence costs: the card balance for card bills that follow it. */
export function billPaymentAmount(store: Store, bill: Bill, today: ISODate): Minor {
  if (bill.payToAccountId && bill.amountSource !== 'fixed') {
    const card = store.data.accounts.find((a) => a.id === bill.payToAccountId);
    if (card) return Math.max(0, -accountBalance(card, store.data.transactions, today));
  }
  return bill.amount;
}

/**
 * Record a bill occurrence as paid. Card bills become a transfer pair
 * (bank −X, card +X) so card-to-pay drops and nothing is double counted.
 */
export async function markBillPaid(
  store: Store,
  bill: Bill,
  dueDate: ISODate,
  paidOn: ISODate,
  amount: Minor,
): Promise<Undo> {
  const base = { date: paidOn, note: bill.name, cleared: false, billId: bill.id, billDueDate: dueDate };
  const rows: Transaction[] = [];
  if (bill.payToAccountId) {
    const transferId = uid();
    rows.push(
      { ...base, id: uid(), amount: -amount, accountId: bill.accountId, source: 'transfer', transferId, updatedAt: 0 },
      { id: uid(), date: paidOn, amount, accountId: bill.payToAccountId, note: bill.name, source: 'transfer', transferId, cleared: false, updatedAt: 0 },
    );
  } else {
    rows.push({ ...base, id: uid(), amount: -amount, accountId: bill.accountId, categoryId: bill.categoryId, source: 'bill', updatedAt: 0 });
  }
  const saved = await store.upsert('transactions', rows);
  return () => store.remove('transactions', saved.map((t) => t.id));
}

export async function confirmPay(store: Store, income: Income, date: ISODate, amount: Minor): Promise<Undo> {
  const [tx] = await store.upsert('transactions', [
    {
      id: uid(), date, amount: Math.abs(amount), accountId: income.accountId, note: income.name,
      source: 'income', incomeId: income.id, incomeDate: date, cleared: false,
    },
  ]);
  return () => store.remove('transactions', [tx.id]);
}

/** Set an account's current balance by adjusting its opening balance (keeps history intact). */
export function openingBalanceFor(account: Pick<Account, 'id'>, currentBalance: Minor, store: Store, today: ISODate): Minor {
  const txSum = accountBalance({ ...(account as Account), openingBalance: 0 }, store.data.transactions, today);
  return currentBalance - txSum;
}

export interface OnboardingInput {
  name: string;
  currency: Store['data']['settings']['currency'];
  decimalSeparator: '.' | ',';
  balance: Minor | null;
  pay: { amount: Minor; variable: boolean; schedule: Schedule } | null;
  bills: Array<{ name: string; amount: Minor; schedule: Schedule }>;
}

export async function completeOnboarding(store: Store, input: OnboardingInput): Promise<void> {
  const accountId = uid();
  const { categories } = store.data;
  await store.upsert('accounts', [
    {
      id: accountId, name: 'Main account', type: 'checking', openingBalance: input.balance ?? 0,
      includeInSafeToSpend: true, archived: false,
    },
  ]);
  if (input.pay) {
    await store.upsert('incomes', [
      { id: uid(), name: 'Paycheck', amount: input.pay.amount, accountId, schedule: input.pay.schedule, variable: input.pay.variable, active: true },
    ]);
  }
  if (input.bills.length) {
    await store.upsert(
      'bills',
      input.bills.map((b) => ({
        id: uid(), name: b.name, amount: b.amount, accountId, schedule: b.schedule, autopay: false, isDebtMinimum: false, active: true,
        categoryId: categoryByName(categories, COMMON_BILLS.find((c) => c.name === b.name)?.categoryName ?? 'Bills')?.id,
      })),
    );
  }
  await store.saveSettings({
    name: input.name.trim(),
    currency: input.currency,
    decimalSeparator: input.decimalSeparator,
    defaultAccountId: accountId,
    onboarded: true,
    exampleData: false,
  });
}

export async function loadExampleData(store: Store, today: ISODate): Promise<void> {
  const ex = buildExampleData(today, store.data.categories);
  await store.upsert('accounts', ex.accounts);
  await store.upsert('incomes', ex.incomes);
  await store.upsert('bills', ex.bills);
  await store.upsert('transactions', ex.transactions);
  await store.upsert('goals', ex.goals);
  await store.upsert('debts', ex.debts);
  await store.upsert('categories', ex.categories);
  await store.saveSettings({ onboarded: true, exampleData: true, defaultAccountId: ex.defaultAccountId });
}

/** "Clear examples": remove everything and go back to setup. Categories are reset to defaults. */
export async function clearExampleData(store: Store): Promise<void> {
  await store.clearData(LIST_STORES);
  await store.upsert('categories', buildDefaultCategories());
  await store.saveSettings({ onboarded: false, exampleData: false, defaultAccountId: undefined });
}
