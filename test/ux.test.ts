// UX pass: balance freshness, the "What's your balance today?" update, setup's number preview,
// backup check, quick-log category suggestions, currency display, and the words we never use.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DB, uid } from '../src/db/db';
import { defaultSettings, guessCurrency } from '../src/db/settings';
import type { Account, Category, Rule } from '../src/db/types';
import { readBackupText } from '../src/lib/backup/format';
import { buildPartnerSummary } from '../src/lib/backup/partner';
import { balanceFreshness, freshnessText, STALE_AFTER_DAYS } from '../src/lib/freshness';
import { CURRENCIES, formatMoney } from '../src/lib/money';
import { parseQuickLog, suggestCategory } from '../src/lib/quickLog';
import { computeSafeToSpend } from '../src/lib/safeToSpend';
import { buildOnboarding, markBalanceChecked, updateBalances } from '../src/state/actions';
import { makeBackup, verifyBackup } from '../src/state/backupActions';
import { Store } from '../src/state/store';

const freshStore = async () => Store.load(await DB.open('t-' + uid(), new IDBFactory()));
const acc = (id: string, extra: Partial<Account> = {}): Account => ({
  id, name: id, type: 'checking', openingBalance: 0, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false, updatedAt: 0, ...extra,
});

async function seeded() {
  const store = await freshStore();
  await store.upsert('accounts', [
    { id: 'chk', name: 'Everyday', type: 'checking', openingBalance: 120000, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false },
    { id: 'card', name: 'Card', type: 'credit', openingBalance: -20000, openingDate: '2026-10-01', includeInSafeToSpend: true, archived: false },
  ]);
  await store.upsert('transactions', [
    { id: 't1', date: '2026-10-02', amount: -575, accountId: 'chk', note: 'Coffee', source: 'manual', cleared: false },
    { id: 't2', date: '2026-10-04', amount: -8642, accountId: 'chk', note: 'Groceries', source: 'manual', cleared: false },
  ]);
  return store;
}
const sts = (store: Store, today: string) => computeSafeToSpend({ today, ...store.data, settings: store.data.settings });

describe('balance freshness', () => {
  it('counts days since the oldest confirmed balance among included accounts', () => {
    const accounts = [
      acc('a', { balanceCheckedAt: '2026-10-07' }),
      acc('b', { openingDate: '2026-10-04' }), // never checked since it was set
      acc('old', { openingDate: '2026-01-01', archived: true }), // archived: ignored
      acc('sav', { openingDate: '2026-01-01', includeInSafeToSpend: false }), // not counted: ignored
    ];
    expect(balanceFreshness(accounts, '2026-10-08')).toEqual({ lastChecked: '2026-10-04', daysAgo: 4, stale: true });
  });

  it('wording: "Updated today", then "N days ago"; "About" from day 3', () => {
    const at = (checked: string) => balanceFreshness([acc('a', { balanceCheckedAt: checked })], '2026-10-08');
    expect(freshnessText(at('2026-10-08'))).toBe('Updated today');
    expect(freshnessText(at('2026-10-07'))).toBe('Balance last checked 1 day ago');
    expect(freshnessText(at('2026-10-06'))).toBe('Balance last checked 2 days ago');
    expect(at('2026-10-06').stale).toBe(false);
    expect(STALE_AFTER_DAYS).toBe(3);
    expect(at('2026-10-05').stale).toBe(true);
    expect(freshnessText(at('2026-10-05'))).toBe('Balance last checked 3 days ago');
  });

  it('no accounts: nothing to say, never stale', () => {
    expect(balanceFreshness([], '2026-10-08')).toEqual({ lastChecked: null, daysAgo: null, stale: false });
  });

  it('age changes only the wording — the number is the same whether fresh or stale', async () => {
    const store = await seeded();
    const before = sts(store, '2026-10-08');
    await store.upsert('accounts', store.data.accounts.map((a) => ({ ...a, balanceCheckedAt: '2026-10-08' })));
    expect(sts(store, '2026-10-08')).toEqual(before);
  });
});

describe("What's your balance today?", () => {
  it('sets each balance as of today, marks it checked, and undo puts it back', async () => {
    const store = await seeded();
    const before = structuredClone(store.data.accounts);
    const undo = await updateBalances(store, [{ accountId: 'chk', balance: 100000 }, { accountId: 'card', balance: 15000 }], '2026-10-08');
    const chk = store.data.accounts.find((a) => a.id === 'chk')!;
    const card = store.data.accounts.find((a) => a.id === 'card')!;
    expect(chk).toMatchObject({ openingBalance: 100000, openingDate: '2026-10-08', balanceCheckedAt: '2026-10-08' });
    expect(card.openingBalance).toBe(-15000); // a card's balance is what's owed
    expect(balanceFreshness(store.data.accounts, '2026-10-08').stale).toBe(false);

    // Confirming a bill dated before today afterwards doesn't move the balance again.
    await store.upsert('transactions', [{ id: 'late', date: '2026-10-05', amount: -5000, accountId: 'chk', note: 'Phone', source: 'bill', cleared: false }]);
    const s = sts(store, '2026-10-08');
    expect(s.available).toBe(100000 - 15000);

    await undo();
    expect(store.data.accounts.map(({ updatedAt: _u, ...a }) => a)).toEqual(before.map(({ updatedAt: _u, ...a }) => a));
  });

  it('a statement check moves "last checked" forward, never back', async () => {
    const store = await seeded();
    await markBalanceChecked(store, 'chk', '2026-10-06');
    expect(store.data.accounts.find((a) => a.id === 'chk')!.balanceCheckedAt).toBe('2026-10-06');
    await markBalanceChecked(store, 'chk', '2026-10-03');
    expect(store.data.accounts.find((a) => a.id === 'chk')!.balanceCheckedAt).toBe('2026-10-06');
  });
});

describe('setup', () => {
  const sched = (anchorDate: string, dayOfMonth: number) => ({ kind: 'monthly' as const, anchorDate, dayOfMonth, weekendShift: 'none' as const });
  const input = {
    name: '', currency: 'USD' as const, decimalSeparator: '.' as const, today: '2026-10-08',
    balance: 150000,
    pay: { amount: 180000, variable: false, schedule: sched('2026-10-15', 15) },
    bills: [{ name: 'Phone', amount: 4500, schedule: sched('2026-10-10', 10) }, { name: 'Rent', amount: 95000, schedule: sched('2026-11-01', 1) }],
  };

  it('"Your number" preview is the real calculation on what setup will save', async () => {
    const built = buildOnboarding(input, []);
    expect(built.account).toMatchObject({ openingBalance: 150000, openingDate: '2026-10-08', balanceCheckedAt: '2026-10-08' });
    const preview = computeSafeToSpend({
      today: '2026-10-08', accounts: [built.account], transactions: [], incomes: [built.income!], bills: built.bills, goals: [],
      settings: { buffer: 0, setAsideGoals: false },
    });
    // Only the phone bill (10th) falls before payday (15th); rent waits.
    expect(preview.upcomingBills).toBe(4500);
    expect(preview.nextPayday).toBe('2026-10-15');
  });

  it('no balance entered: nothing claims to be checked', () => {
    expect(buildOnboarding({ ...input, balance: null }, []).account.balanceCheckedAt).toBeUndefined();
  });
});

describe('backup check', () => {
  it('a saved backup decrypts and matches the device', async () => {
    const store = await seeded();
    await expect(verifyBackup(store, await makeBackup(store, '1'))).resolves.toBeUndefined();
    const locked = await makeBackup(store, '1', 'tulip sky 42');
    await expect(verifyBackup(store, locked, 'tulip sky 42')).resolves.toBeUndefined();
  });

  it('fails loudly when the file is wrong, the passphrase is wrong, or contents differ', async () => {
    const store = await seeded();
    const locked = await makeBackup(store, '1', 'tulip sky 42');
    await expect(verifyBackup(store, locked, 'wrong passphrase')).rejects.toThrow();
    await expect(verifyBackup(store, locked)).rejects.toThrow(/couldn’t be opened/);
    const plain = await makeBackup(store, '1');
    await expect(verifyBackup(store, { ...plain, text: plain.text.slice(0, -20) })).rejects.toThrow();
    await store.upsert('transactions', [{ id: 't3', date: '2026-10-05', amount: -100, accountId: 'chk', note: 'x', source: 'manual', cleared: false }]);
    await expect(verifyBackup(store, plain)).rejects.toThrow(/doesn’t match/);
  });
});

describe('quick log', () => {
  const cats: Category[] = [
    { id: 'eat', name: 'Eating out', icon: 'coffee', color: '#ccc', order: 0, archived: false, updatedAt: 0 },
    { id: 'groc', name: 'Groceries', icon: 'cart', color: '#ccc', order: 1, archived: false, updatedAt: 0 },
    { id: 'gone', name: 'Old', icon: 'package', color: '#ccc', order: 2, archived: true, updatedAt: 0 },
  ];
  const rule = (pattern: string, categoryId: string): Rule => ({ id: uid(), matchType: 'contains', pattern, categoryId, priority: 0, updatedAt: 0 });

  it('suggests a category from the merchant text: a saved rule first, then names and keywords', () => {
    const rules = [rule('tesco', 'groc'), rule('oldshop', 'gone')];
    expect(suggestCategory('Tesco Express', cats, rules)).toBe('groc');
    expect(parseQuickLog('12.50 tesco', cats, '.', rules)).toMatchObject({ kind: 'ok', amount: 1250, categoryId: 'groc', note: 'Tesco' });
    // A rule pointing at an archived category is ignored.
    expect(suggestCategory('oldshop', cats, rules)).not.toBe('gone');
  });

  it('category is optional: unknown text logs with none', () => {
    expect(parseQuickLog('7 zzqx', cats, '.')).toMatchObject({ kind: 'ok', amount: 700, categoryId: undefined });
    expect(parseQuickLog('7', cats, '.')).toMatchObject({ kind: 'ok', amount: 700, categoryId: undefined });
  });
});

describe('currency', () => {
  it('offers USD, GBP, EUR, CAD and AUD', () => {
    expect([...CURRENCIES]).toEqual(expect.arrayContaining(['USD', 'GBP', 'EUR', 'CAD', 'AUD']));
  });

  it('defaults from the device locale', () => {
    expect(guessCurrency('en-US')).toBe('USD');
    expect(guessCurrency('en-GB')).toBe('GBP');
    expect(guessCurrency('fr-FR')).toBe('EUR');
    expect(guessCurrency('en-CA')).toBe('CAD');
    expect(guessCurrency('en-AU')).toBe('AUD');
    expect(guessCurrency('en')).toBe('USD');
    expect(defaultSettings('en-GB').currency).toBe('GBP');
    expect(defaultSettings('en-AU').currency).toBe('AUD');
  });

  it('shows the right symbol; the stored amount is whole cents either way', () => {
    expect(formatMoney(123456, 'USD', 'en-US')).toBe('$1,234.56');
    expect(formatMoney(123456, 'GBP', 'en-GB')).toBe('£1,234.56');
    expect(formatMoney(123456, 'EUR', 'en-IE')).toBe('€1,234.56');
    expect(formatMoney(123456, 'CAD', 'en-CA')).toBe('$1,234.56');
    expect(formatMoney(123456, 'AUD', 'en-AU')).toBe('$1,234.56');
    expect(formatMoney(123456, 'GBP', 'en-US')).toBe('£1,234.56'); // switching currency keeps the locale's layout
  });

  it('switching currency changes no amounts; backups and partner shares carry the currency', async () => {
    const store = await seeded();
    const amounts = () => [...store.data.transactions.map((t) => t.amount), ...store.data.accounts.map((a) => a.openingBalance)];
    const before = amounts();
    await store.saveSettings({ currency: 'GBP' });
    expect(amounts()).toEqual(before);
    expect(amounts().every(Number.isInteger)).toBe(true);

    const read = await readBackupText((await makeBackup(store, '1')).text);
    if (read.kind !== 'backup') throw new Error('expected a backup');
    expect(JSON.stringify(read.file.stores.settings)).toContain('"currency":"GBP"');

    expect(buildPartnerSummary(store.data, '2026-10-08', false).currency).toBe('GBP');
  });
});

describe('words', () => {
  // Never "behind" or "missed" in anything a person reads. Comments are fine.
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?|md)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

  it('the app and the Start-Here guide never say "behind" or "missed"', () => {
    const offenders: string[] = [];
    for (const f of [...files('src'), 'scripts/build-pdf.mjs', 'scripts/build-site.mjs']) {
      const text = stripComments(fs.readFileSync(f, 'utf8'));
      for (const m of text.matchAll(/\b(behind|missed)\b/gi)) offenders.push(`${f}: …${text.slice(Math.max(0, m.index! - 30), m.index! + 20)}…`);
    }
    expect(offenders).toEqual([]);
  });
});
