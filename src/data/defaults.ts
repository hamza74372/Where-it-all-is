// Starter content: categories, quick-log keywords, onboarding bill list, preset chips, example data.

import { uid } from '../db/db';
import type { Account, Bill, Category, Debt, Goal, Income, ISODate, QuickPreset, Schedule, Transaction } from '../db/types';
import { addDays, parts, weekday } from '../lib/dates';
import type { Currency } from '../lib/money';
import { nextOccurrence } from '../lib/schedule';

type CategorySeed = Pick<Category, 'name' | 'icon' | 'color'> & { keywords: string[] };

/** Default envelopes. Keywords help quick log ("12 coffee" → Eating out). */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Groceries', icon: 'shopping-cart', color: '#7cbf9a', keywords: ['grocery', 'groceries', 'food shop', 'supermarket', 'tesco', 'walmart', 'aldi', 'lidl', 'sainsbury', 'asda', 'kroger', 'costco', 'woolworths', 'coles', 'milk', 'bread'] },
  { name: 'Eating out', icon: 'utensils', color: '#e8b54a', keywords: ['lunch', 'dinner', 'breakfast', 'takeaway', 'takeout', 'restaurant', 'pizza', 'burger', 'snack', 'mcdonalds', 'deliveroo', 'doordash', 'ubereats', 'drinks', 'pub', 'bar'] },
  { name: 'Coffee', icon: 'coffee', color: '#c9a27e', keywords: ['coffee', 'cafe', 'café', 'latte', 'cappuccino', 'flat white', 'espresso', 'starbucks', 'costa', 'dunkin', 'tim hortons', 'pret'] },
  { name: 'Transport', icon: 'bus', color: '#8aa9d6', keywords: ['bus', 'train', 'tube', 'metro', 'taxi', 'uber', 'lyft', 'parking', 'gas', 'petrol', 'fuel', 'diesel', 'toll', 'fare', 'car'] },
  { name: 'Shopping', icon: 'shopping-bag', color: '#c7a0d9', keywords: ['amazon', 'clothes', 'shoes', 'shop', 'shopping', 'target', 'ebay', 'etsy'] },
  { name: 'Fun', icon: 'party-popper', color: '#f0a07a', keywords: ['cinema', 'movie', 'movies', 'game', 'games', 'concert', 'tickets', 'hobby', 'books', 'book', 'fun', 'night out'] },
  { name: 'Health', icon: 'pill', color: '#9fd0c9', keywords: ['pharmacy', 'chemist', 'doctor', 'dentist', 'meds', 'medicine', 'prescription', 'gym', 'therapy', 'boots', 'cvs', 'walgreens'] },
  { name: 'Home', icon: 'house', color: '#b9b08a', keywords: ['rent', 'mortgage', 'furniture', 'cleaning', 'hardware', 'ikea', 'repairs'] },
  { name: 'Bills', icon: 'receipt', color: '#a3a9b8', keywords: ['electric', 'electricity', 'water', 'internet', 'broadband', 'phone', 'mobile', 'utility', 'insurance', 'council tax'] },
  { name: 'Subscriptions', icon: 'tv', color: '#d99aa8', keywords: ['netflix', 'spotify', 'disney', 'hulu', 'prime', 'apple', 'youtube', 'subscription', 'icloud', 'patreon'] },
  { name: 'Gifts', icon: 'gift', color: '#e3a3c4', keywords: ['gift', 'gifts', 'present', 'birthday', 'christmas'] },
  { name: 'Kids & pets', icon: 'paw-print', color: '#a8c7e8', keywords: ['kids', 'school', 'childcare', 'nursery', 'pet', 'vet', 'dog', 'cat'] },
  { name: 'Bank fees', icon: 'landmark', color: '#b7b2c9', keywords: ['fee', 'fees', 'overdraft', 'commission'] },
  { name: 'Other', icon: 'package', color: '#c4c4c4', keywords: ['other', 'misc', 'cash'] },
];

export const CATEGORY_KEYWORDS: Record<string, string[]> = Object.fromEntries(
  DEFAULT_CATEGORIES.map((c) => [c.name, c.keywords]),
);

export function buildDefaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: uid(),
    name: c.name,
    icon: c.icon,
    color: c.color,
    order: i,
    archived: false,
    updatedAt: Date.now(),
  }));
}

/** Onboarding quick-add list (spec §7.1 step 4). */
export const COMMON_BILLS: Array<{ name: string; icon: string; categoryName: string }> = [
  { name: 'Rent or mortgage', icon: 'house', categoryName: 'Home' },
  { name: 'Phone', icon: 'smartphone', categoryName: 'Bills' },
  { name: 'Electric', icon: 'lightbulb', categoryName: 'Bills' },
  { name: 'Internet', icon: 'wifi', categoryName: 'Bills' },
  { name: 'Car payment', icon: 'car', categoryName: 'Transport' },
  { name: 'Subscriptions', icon: 'tv', categoryName: 'Subscriptions' },
];

/** Starter chip amounts, rounded to feel natural in each currency. */
export function defaultPresets(currency: Currency): QuickPreset[] {
  const coffee = currency === 'GBP' || currency === 'EUR' ? 350 : 500;
  return [
    { id: 'p-coffee', icon: 'coffee', label: 'Coffee', amount: coffee, categoryName: 'Coffee' },
    { id: 'p-lunch', icon: 'sandwich', label: 'Lunch', amount: 1200, categoryName: 'Eating out' },
    { id: 'p-groceries', icon: 'shopping-cart', label: 'Groceries', amount: 5000, categoryName: 'Groceries' },
    { id: 'p-transport', icon: 'bus', label: 'Travel', amount: 300, categoryName: 'Transport' },
  ];
}

const monthly = (anchorDate: ISODate, extra: Partial<Schedule> = {}): Schedule => ({
  kind: 'monthly',
  anchorDate,
  dayOfMonth: parts(anchorDate).d,
  weekendShift: 'none',
  ...extra,
});

/** Next date on or after `from` that falls on day-of-month `day` (clamped to short months). */
export function nextDayOfMonth(from: ISODate, day: number): ISODate {
  const { y, m } = parts(from);
  return nextOccurrence(monthly(`${y}-${String(m).padStart(2, '0')}-01`, { dayOfMonth: day }), from)!;
}

/** "Try with example numbers": a realistic, clearly labelled household. */
export function buildExampleData(today: ISODate, categories: Category[]) {
  const cat = (name: string) => categories.find((c) => c.name === name)?.id;
  const now = Date.now();
  const checking: Account = { id: uid(), name: 'Everyday account', type: 'checking', openingBalance: 132000, includeInSafeToSpend: true, archived: false, balanceCheckedAt: today, updatedAt: now };
  const card: Account = { id: uid(), name: 'Credit card', type: 'credit', openingBalance: -6400, includeInSafeToSpend: false, archived: false, updatedAt: now };
  const savings: Account = { id: uid(), name: 'Savings', type: 'savings', openingBalance: 85000, includeInSafeToSpend: false, archived: false, updatedAt: now };

  // Paid every other Friday, next one within the coming fortnight.
  const daysToFriday = (5 - weekday(today) + 7) % 7 || 7;
  const pay: Income = {
    id: uid(), name: 'Paycheck', amount: 185000, accountId: checking.id, variable: false, active: true, updatedAt: now,
    schedule: { kind: 'biweekly', anchorDate: addDays(today, daysToFriday), weekendShift: 'before' },
  };

  const bill = (name: string, amount: number, day: number, categoryName: string, extra: Partial<Bill> = {}): Bill => ({
    id: uid(), name, amount, accountId: checking.id, categoryId: cat(categoryName), autopay: false, isDebtMinimum: false,
    active: true, updatedAt: now, schedule: monthly(nextDayOfMonth(today, day)), ...extra,
  });
  const bills: Bill[] = [
    bill('Rent', 95000, 1, 'Home', { autopay: true }),
    bill('Phone', 4500, 12, 'Bills', { autopay: true }),
    bill('Electric', 8000, 15, 'Bills'),
    bill('Internet', 5500, 20, 'Bills', { autopay: true }),
    bill('Streaming', 1549, 8, 'Subscriptions', { autopay: true }),
    bill('Credit card', 0, 25, 'Bills', { payToAccountId: card.id, amountSource: 'cardBalance' }),
  ];

  const spend = (daysAgo: number, amount: number, note: string, categoryName: string, accountId = checking.id): Transaction => ({
    id: uid(), date: addDays(today, -daysAgo), amount: -amount, accountId, categoryId: cat(categoryName), note,
    source: 'manual', cleared: true, updatedAt: now,
  });
  const monthDate = (monthsAgo: number, day: number): ISODate => {
    const p = parts(today);
    const date = new Date(Date.UTC(p.y, p.m - 1 - monthsAgo, day));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  };
  const historyMonths = [
    { monthsAgo: 1, income: 192949, groceries: 36000, eatingOut: 12400, transport: 10000, fun: 8000 },
    { monthsAgo: 2, income: 202749, groceries: 38500, eatingOut: 13500, transport: 11000, fun: 9200 },
    { monthsAgo: 3, income: 191849, groceries: 34500, eatingOut: 11800, transport: 9500, fun: 7500 },
    { monthsAgo: 4, income: 209649, groceries: 40000, eatingOut: 15500, transport: 11800, fun: 9800 },
    { monthsAgo: 5, income: 124749, groceries: 37200, eatingOut: 14200, transport: 10200, fun: 8600 },
  ];
  const historyTransactions: Transaction[] = __DEMO__ ? [] : historyMonths.flatMap((month) => {
    const entry = (day: number, amount: number, note: string, categoryName?: string): Transaction => ({
      id: uid(), date: monthDate(month.monthsAgo, day), amount, accountId: checking.id,
      categoryId: categoryName ? cat(categoryName) : undefined, note, source: 'manual', cleared: true, updatedAt: now,
    });
    return [
      entry(7, Math.floor(month.income / 2), 'Paycheck'),
      entry(21, Math.ceil(month.income / 2), 'Paycheck'),
      entry(1, -95000, 'Rent', 'Home'),
      entry(8, -1549, 'Streaming', 'Subscriptions'),
      entry(12, -4500, 'Phone', 'Bills'),
      entry(15, -8000, 'Electric', 'Bills'),
      entry(20, -5500, 'Internet', 'Bills'),
      entry(6, -month.groceries, 'Groceries', 'Groceries'),
      entry(11, -month.eatingOut, 'Eating out', 'Eating out'),
      entry(16, -month.transport, 'Transport', 'Transport'),
      entry(22, -month.fun, 'Fun', 'Fun'),
    ];
  });
  const transactions: Transaction[] = [
    spend(1, 3420, 'Big shop', 'Groceries'),
    spend(1, 450, 'Coffee', 'Coffee'),
    spend(2, 1800, 'Bus pass top-up', 'Transport'),
    spend(3, 2250, 'Takeaway', 'Eating out', card.id),
    spend(4, 1299, 'Book', 'Fun'),
    spend(5, 2875, 'Groceries', 'Groceries'),
    ...historyTransactions,
  ];

  const limits: Record<string, number> = { Groceries: 40000, 'Eating out': 15000, Transport: 12000, Fun: 10000 };
  const limitedCategories = categories.filter((c) => c.name in limits).map((c) => ({ ...c, monthlyLimit: limits[c.name] }));
  const inMonths = (n: number) => {
    const p = parts(today);
    const t = new Date(Date.UTC(p.y, p.m - 1 + n, 1));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-01`;
  };
  const goals: Goal[] = [
    { id: uid(), name: 'Holiday', icon: 'plane', target: 120000, saved: 35000, targetDate: inMonths(8), updatedAt: now },
    { id: uid(), name: 'Emergency cushion', icon: 'life-buoy', target: 100000, saved: 85000, updatedAt: now },
  ];
  const debts: Debt[] = [
    { id: uid(), name: 'Store card', balance: 85000, apr: 29.9, minPayment: 2500, createdAt: now, updatedAt: now },
    { id: uid(), name: 'Car loan', balance: 620000, apr: 7.9, minPayment: 21000, createdAt: now, updatedAt: now },
  ];

  return {
    accounts: [checking, card, savings], incomes: [pay], bills, transactions, goals, debts, categories: limitedCategories,
    defaultAccountId: checking.id,
  };
}
