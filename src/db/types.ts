// Data model — see SPEC §5. All money fields are integer minor units.
// Dates are local calendar dates as 'YYYY-MM-DD' strings (no time zone drift).
// Every record carries `updatedAt` (ms epoch) so device merge can be last-write-wins.

import type { Currency, Minor } from '../lib/money';

export type ISODate = string; // 'YYYY-MM-DD'
export type Id = string;

export interface BaseRecord {
  id: Id;
  updatedAt: number;
}

export type ScheduleKind =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'everyNMonths'
  | 'yearly';

export interface Schedule {
  kind: ScheduleKind;
  anchorDate: ISODate;
  dayOfMonth?: number;
  secondDayOfMonth?: number;
  n?: number;
  weekendShift: 'none' | 'before' | 'after';
}

export type Theme = 'auto' | 'soft' | 'midnight';

export interface Settings extends BaseRecord {
  id: 'main';
  name: string;
  currency: Currency;
  locale: string;
  theme: Theme;
  mode: 'simple' | 'full';
  weekStart: 0 | 1 | 6;
  createdAt: number;
  schemaVersion: number;
  lastOpenedAt: number;
  backupRemindDays: number;
  /** Safe-to-spend cushion kept back, minor units. */
  buffer: Minor;
  /** Whether planned goal contributions are subtracted from safe-to-spend. */
  setAsideGoals: boolean;
  lastBackupAt?: number;
  exampleData?: boolean;
  onboarded?: boolean;
}

export interface Account extends BaseRecord {
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'credit';
  openingBalance: Minor;
  includeInSafeToSpend: boolean;
  archived: boolean;
}

export interface Income extends BaseRecord {
  name: string;
  amount: Minor;
  accountId: Id;
  schedule: Schedule;
  variable: boolean;
  active: boolean;
}

export interface Bill extends BaseRecord {
  name: string;
  amount: Minor;
  accountId: Id;
  categoryId?: Id;
  schedule: Schedule;
  autopay: boolean;
  isDebtMinimum: boolean;
  debtId?: Id;
  /** Set when this bill pays another account (a credit card): paying it is a transfer. */
  payToAccountId?: Id;
  active: boolean;
}

export interface Category extends BaseRecord {
  name: string;
  emoji: string;
  monthlyLimit?: Minor;
  color: string;
  order: number;
  archived: boolean;
}

export interface Transaction extends BaseRecord {
  date: ISODate;
  /** Signed: negative = money out of the account, positive = money in. */
  amount: Minor;
  accountId: Id;
  categoryId?: Id;
  note: string;
  source: 'manual' | 'import' | 'bill' | 'income' | 'transfer';
  importBatchId?: Id;
  billId?: Id;
  /** For source 'bill': which due date this payment covers. */
  billDueDate?: ISODate;
  incomeId?: Id;
  incomeDate?: ISODate;
  /** For transfers (e.g. paying a credit card): the paired transaction's id. */
  transferId?: Id;
  cleared: boolean;
}

export interface Debt extends BaseRecord {
  name: string;
  balance: Minor;
  apr: number; // percent, e.g. 22.9
  minPayment: Minor;
  accountId?: Id;
  createdAt: number;
}

export interface Goal extends BaseRecord {
  name: string;
  target: Minor;
  saved: Minor;
  targetDate?: ISODate;
  emoji: string;
}

export interface Rule extends BaseRecord {
  matchType: 'contains' | 'startsWith' | 'regex';
  pattern: string;
  categoryId: Id;
  renameTo?: string;
  priority: number;
}

export interface ImportBatch extends BaseRecord {
  fileName: string;
  importedAt: number;
  rowCount: number;
  accountId: Id;
  mappingId?: Id;
}

export interface CsvMapping extends BaseRecord {
  name: string;
  dateCol: number;
  amountCol?: number;
  debitCol?: number;
  creditCol?: number;
  descCol: number;
  dateFormat: string;
  signConvention: 'negativeIsOut' | 'positiveIsOut';
  headerRow: number;
}

export interface Note extends BaseRecord {
  month: string; // 'YYYY-MM'
  text: string;
}

export interface AppEvent extends BaseRecord {
  ts: number;
  type: string;
  payload: unknown;
}

export interface StoreMap {
  settings: Settings;
  accounts: Account;
  incomes: Income;
  bills: Bill;
  categories: Category;
  transactions: Transaction;
  debts: Debt;
  goals: Goal;
  rules: Rule;
  importBatches: ImportBatch;
  csvMappings: CsvMapping;
  notes: Note;
  events: AppEvent;
}

export type StoreName = keyof StoreMap;
