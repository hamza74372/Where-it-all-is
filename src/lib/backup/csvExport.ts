// CSV export of transactions (opens in Excel, Numbers, Google Sheets).

import type { Account, Category, Transaction } from '../../db/types';
import { toDecimalString } from '../money';

const SOURCE: Record<Transaction['source'], string> = {
  manual: 'Logged',
  import: 'Imported',
  bill: 'Bill',
  income: 'Pay',
  transfer: 'Transfer',
  adjustment: 'Balance adjustment',
};

function cell(v: string): string {
  // Quote when needed; neutralise leading = + - @ so spreadsheets don't run it as a formula.
  const safe = /^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function transactionsToCsv(transactions: Transaction[], categories: Category[], accounts: Account[]): string {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const header = ['Date', 'Description', 'Amount', 'Category', 'Account', 'Type', 'Bank description', 'Counts in balance'];
  const rows = [...transactions]
    .sort((a, b) => (a.date === b.date ? a.updatedAt - b.updatedAt : a.date < b.date ? -1 : 1))
    .map((t) => {
      const a = acc.get(t.accountId);
      const before = !!a?.openingDate && t.date < a.openingDate;
      return [
        t.date,
        t.note,
        toDecimalString(t.amount),
        t.categoryId ? cat.get(t.categoryId) ?? '' : '',
        a?.name ?? '',
        SOURCE[t.source],
        t.importDescription ?? '',
        before ? 'No (before you started)' : 'Yes',
      ];
    });
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
