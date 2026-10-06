import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Category, Rule, Transaction } from '../src/db/types';
import { DEFAULT_CATEGORIES } from '../src/data/defaults';
import { convertRows, markDuplicates, merchantKey, normaliseDescription, tidyDescription } from '../src/lib/csv/convert';
import { detectDateFormat, parseDateAs } from '../src/lib/csv/dates';
import { detectMapping } from '../src/lib/csv/detect';
import { parseCsv } from '../src/lib/csv/parse';
import { applyRules, buildStarterRules, ruleMatches } from '../src/lib/rules';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures/csv', name), 'utf8');

function load(name: string, region: 'DMY' | 'MDY' = 'MDY') {
  const { rows, delimiter } = parseCsv(fixture(name));
  const det = detectMapping(rows, region)!;
  const conv = convertRows(rows, det.mapping);
  return { rows, delimiter, det, m: det.mapping, ...conv };
}
const summary = (d: { date: string; amount: number; description: string }) => [d.date, d.amount, d.description];

describe('CSV parser', () => {
  it('quotes, escaped quotes, commas and newlines inside quotes, CRLF', () => {
    const { rows } = parseCsv('a,"b, c","say ""hi""","line1\r\nline2"\r\n1,2,3,4\r\n');
    expect(rows).toEqual([['a', 'b, c', 'say "hi"', 'line1\r\nline2'], ['1', '2', '3', '4']]);
  });
  it('strips a BOM and drops blank lines', () => {
    expect(parseCsv('﻿x,y\n\n1,2\n').rows).toEqual([['x', 'y'], ['1', '2']]);
  });
  it('detects semicolons and tabs', () => {
    expect(parseCsv('a;b;c\n1,5;2;3').delimiter).toBe(';');
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
    expect(parseCsv('a,"x;y",c\n1,2,3').delimiter).toBe(',');
  });
});

describe('dates', () => {
  it('parses each format and rejects impossible dates', () => {
    expect(parseDateAs('10/13/2026', 'MDY')).toBe('2026-10-13');
    expect(parseDateAs('13/10/2026', 'DMY')).toBe('2026-10-13');
    expect(parseDateAs('10/13/26', 'MDY')).toBe('2026-10-13');
    expect(parseDateAs('2026-10-13 09:12:44', 'YMD')).toBe('2026-10-13');
    expect(parseDateAs('01.10.2026', 'DMY')).toBe('2026-10-01');
    expect(parseDateAs('5 Oct 2026', 'D MON Y')).toBe('2026-10-05');
    expect(parseDateAs('Oct 5, 2026', 'MON D Y')).toBe('2026-10-05');
    expect(parseDateAs('31/02/2026', 'DMY')).toBeNull();
    expect(parseDateAs('20-32-06 12345678', 'DMY')).toBeNull();
  });
  it('day/month order comes from the data; region decides only when ambiguous', () => {
    expect(detectDateFormat(['01/10/2026', '14/10/2026'], 'MDY')).toMatchObject({ format: 'DMY', ambiguous: false });
    expect(detectDateFormat(['10/01/2026', '10/14/2026'], 'DMY')).toMatchObject({ format: 'MDY', ambiguous: false });
    // All ≤ 12, but read as DMY it's 1–2 Oct; as MDY it's 10 Jan – 10 Feb. The tight run wins.
    expect(detectDateFormat(['01/10/2026', '02/10/2026', '05/10/2026'], 'MDY')).toMatchObject({ format: 'DMY', ambiguous: false });
    expect(detectDateFormat(['10/01/2026', '10/02/2026', '10/05/2026'], 'DMY')).toMatchObject({ format: 'MDY', ambiguous: false });
    // Truly undecidable (a single date, or both readings equally spread) → region, and ask.
    expect(detectDateFormat(['05/06/2026'], 'DMY')).toMatchObject({ format: 'DMY', ambiguous: true });
    expect(detectDateFormat(['05/06/2026', '06/05/2026'], 'MDY')).toMatchObject({ format: 'MDY', ambiguous: true });
  });
});

describe('bank exports (made-up rows in each bank’s column layout)', () => {
  it('Chase checking', () => {
    const r = load('chase-checking.csv');
    expect(r.m).toMatchObject({ headerRow: 0, dateCol: 1, descCol: 2, amountMode: 'single', amountCol: 3, dateFormat: 'MDY', decimal: '.' });
    expect(r.drafts).toHaveLength(10);
    expect(r.skipped).toEqual([]);
    expect(summary(r.drafts[0])).toEqual(['2026-10-01', -575, 'STARBUCKS STORE 12345 SEATTLE WA']);
    expect(summary(r.drafts[3])).toEqual(['2026-10-05', 185000, 'ACME CORP PAYROLL PPD ID: 1234567890']);
    expect(r.drafts.find((d) => d.description === 'CHECK 1043')?.amount).toBe(-12000);
  });

  it('Bank of America: finds the header under the summary block, skips the balance line', () => {
    const r = load('bofa-checking.csv');
    expect(r.m).toMatchObject({ headerRow: 5, dateCol: 0, descCol: 1, amountCol: 2, dateFormat: 'MDY' });
    expect(r.drafts).toHaveLength(7);
    expect(r.skipped).toEqual([{ rowIndex: 6, reason: 'No amount (often a balance line)' }]);
    expect(r.drafts.find((d) => d.description.startsWith('ACME'))?.amount).toBe(185000);
    expect(r.drafts.at(-1)?.amount).toBe(-103232);
  });

  it('Wells Fargo: no header row', () => {
    const r = load('wells-fargo-checking.csv');
    expect(r.m).toMatchObject({ headerRow: -1, dateCol: 0, amountCol: 1, descCol: 4, dateFormat: 'MDY' });
    expect(r.drafts).toHaveLength(7);
    expect(summary(r.drafts[3])).toEqual(['2026-10-07', -6000, 'CHECK # 1044']);
    expect(r.drafts[2].amount).toBe(185000);
  });

  it('Capital One credit card: Debit = spend, Credit = payments and refunds', () => {
    const r = load('capital-one-credit.csv');
    expect(r.m).toMatchObject({ dateCol: 0, descCol: 3, amountMode: 'debitCredit', debitCol: 5, creditCol: 6, dateFormat: 'YMD' });
    expect(r.drafts.map((d) => d.amount)).toEqual([-1435, -6320, 25000, -2499, -3147, 2499, -7999]);
  });

  it('Capital One 360: Debit/Credit type column sets the sign; account number is not the amount', () => {
    const r = load('capital-one-360.csv');
    expect(r.m).toMatchObject({ dateCol: 2, descCol: 1, amountCol: 4, typeCol: 3, dateFormat: 'MDY' });
    expect(r.drafts.map((d) => d.amount)).toEqual([-5218, -1807, 185000, -6500, -4162, 42]);
    expect(r.drafts[4].date).toBe('2026-10-13');
  });

  it('Barclays: DD/MM/YYYY, sort-code column ignored, Memo as description', () => {
    const r = load('barclays.csv', 'MDY'); // region says MDY, data says DMY (14/10) — data wins
    expect(r.m).toMatchObject({ dateCol: 1, amountCol: 3, descCol: 5, dateFormat: 'DMY' });
    expect(r.det.ambiguousDate).toBe(false);
    expect(r.drafts).toHaveLength(7);
    expect(summary(r.drafts[1])).toEqual(['2026-10-02', -2345, 'TESCO STORES 3297 ON 01 OCT BCC']);
    expect(r.drafts[3].amount).toBe(162500);
  });

  it('HSBC UK: no header, every day ≤ 12 — the date spread settles it even for a US user', () => {
    for (const region of ['DMY', 'MDY'] as const) {
      const r = load('hsbc-uk.csv', region);
      expect(r.m).toMatchObject({ headerRow: -1, dateCol: 0, descCol: 1, amountCol: 2, dateFormat: 'DMY' });
      expect(r.det.ambiguousDate).toBe(false);
      expect(r.drafts.at(-1)).toMatchObject({ date: '2026-10-12', amount: -109999 });
      expect(r.drafts[3].amount).toBe(125000);
    }
  });

  it('Monzo: signed Amount (not Money Out/In), merchant from Name', () => {
    const r = load('monzo.csv', 'DMY');
    expect(r.m).toMatchObject({ dateCol: 1, descCol: 4, amountMode: 'single', amountCol: 7, dateFormat: 'DMY' });
    expect(r.drafts.map((d) => [d.description, d.amount])).toEqual([
      ['Pret A Manger', -420], ['Lidl', -2631], ['ACME LTD', 158000], ['Uber', -1274], ['Netflix', -1099], ['EE Limited', -2500],
    ]);
  });

  it('Revolut: started date, ISO with time, reverted row skipped', () => {
    const r = load('revolut.csv', 'DMY');
    expect(r.m).toMatchObject({ dateCol: 2, descCol: 4, amountCol: 5, stateCol: 8, dateFormat: 'YMD' });
    expect(r.drafts).toHaveLength(5);
    expect(r.skipped).toEqual([{ rowIndex: 4, reason: 'Not completed (reverted)' }]);
    expect(summary(r.drafts[0])).toEqual(['2026-10-01', -1843, 'Lidl']);
  });

  it('Generic: BOM, ($54.12) negatives, $1,850.00 positives, Payee', () => {
    const r = load('generic-parentheses.csv');
    expect(r.m).toMatchObject({ headerRow: 0, dateCol: 0, descCol: 1, amountCol: 2 });
    expect(r.drafts.map((d) => d.amount)).toEqual([-5412, -3800, 185000, -7215, -1998, 1998]);
  });

  it('European: semicolons, DD.MM.YYYY, 1.050,00 style amounts', () => {
    const r = load('generic-eu-semicolon.csv', 'MDY');
    expect(r.delimiter).toBe(';');
    expect(r.m).toMatchObject({ dateCol: 0, descCol: 1, amountCol: 2, decimal: ',', dateFormat: 'DMY' });
    expect(r.drafts.map((d) => d.amount)).toEqual([-105000, -3457, -2109, 243000, -1299, -4990]);
  });

  it('cards that show purchases as positive and payments as negative are flipped', () => {
    const rows = parseCsv(
      'Date,Description,Amount\n10/01/2026,WHOLE FOODS,45.10\n10/02/2026,SHELL OIL,30.00\n10/03/2026,NETFLIX,15.49\n10/05/2026,PAYMENT - THANK YOU,-500.00\n',
    ).rows;
    const det = detectMapping(rows, 'MDY')!;
    expect(det.mapping.signConvention).toBe('positiveIsOut');
    expect(convertRows(rows, det.mapping).drafts.map((d) => d.amount)).toEqual([-4510, -3000, -1549, 50000]);
  });
});

describe('duplicates', () => {
  const tx = (date: string, amount: number, desc: string, accountId = 'chk'): Transaction => ({
    id: desc + date, date, amount, accountId, note: tidyDescription(desc), importDescription: desc, source: 'import', cleared: true, updatedAt: 0,
  });

  it('re-importing the same file finds every row already there', () => {
    const r = load('chase-checking.csv');
    const existing = r.drafts.map((d) => tx(d.date, d.amount, d.description));
    expect(markDuplicates(r.drafts, existing, 'chk').every(Boolean)).toBe(true);
    expect(markDuplicates(r.drafts, existing, 'other-account').some(Boolean)).toBe(false);
  });

  it('counts matter: two identical coffees in the file, one already saved → one is new', () => {
    const d = { rowIndex: 0, date: '2026-10-01', amount: -450, description: 'COSTA COFFEE 43021' };
    expect(markDuplicates([d, { ...d, rowIndex: 1 }], [tx('2026-10-01', -450, 'COSTA COFFEE 99999')], 'chk')).toEqual([true, false]);
  });

  it('normalising ignores card/reference numbers and punctuation', () => {
    expect(normaliseDescription('AMZN Mktp US*2K4AB1CD0 Amzn.com/bill')).toBe(normaliseDescription('AMZN MKTP US*2K4AB1CD0 AMZN.COM/BILL'));
    expect(normaliseDescription('STARBUCKS STORE 12345')).toBe('STARBUCKS STORE');
  });
});

describe('rules', () => {
  const cats: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({ id: c.name, name: c.name, emoji: c.emoji, color: c.color, order: i, archived: false, updatedAt: 0 }));
  let n = 0;
  const starters = buildStarterRules(cats, () => `r${n++}`).map((r) => ({ ...r, updatedAt: 0 })) as Rule[];
  const cat = (desc: string, rules = starters) => applyRules(desc, rules).categoryId;

  it('ships 20 starter rules, all resolved to categories', () => {
    expect(starters).toHaveLength(20);
  });

  it('starter rules file real-looking descriptions sensibly', () => {
    const cases: Array<[string, string | undefined]> = [
      ['STARBUCKS STORE 12345 SEATTLE WA', 'Coffee'],
      ['UBER   *TRIP HELP.UBER.COM CA', 'Transport'],
      ['UBER *EATS PENDING', 'Eating out'],
      ['NETFLIX.COM NETFLIX.COM CA', 'Subscriptions'],
      ['WHOLE FOODS MARKET #10234', 'Groceries'],
      ['AMZN Mktp US*2K4AB1CD0', 'Shopping'],
      ['SHELL OIL 57444123', 'Transport'],
      ['Zelle payment to JOHN LANDLORD', 'Home'],
      ['PG&E DES:WEB ONLINE', 'Bills'],
      ['TESCO STORES 3297', 'Groceries'],
      ['PRET A MANGER LONDON', 'Coffee'],
      ['DOORDASH*THAI PALACE', 'Eating out'],
      ['EE LIMITED', 'Bills'],
      ['MIETE OKTOBER', 'Home'],
      ['CURRENT ACCOUNT INTEREST', undefined], // "RENT" inside a word must not match
      ['ACME CORP PAYROLL', undefined],
    ];
    for (const [desc, expected] of cases) expect([desc, cat(desc)]).toEqual([desc, expected]);
  });

  it('lower priority number wins; contains / startsWith / bad regex', () => {
    const mine: Rule = { id: 'mine', matchType: 'contains', pattern: 'starbucks', categoryId: 'Fun', priority: 100, updatedAt: 0 };
    expect(cat('STARBUCKS STORE 1', [...starters, mine])).toBe('Fun');
    expect(ruleMatches({ matchType: 'startsWith', pattern: 'tesco' }, 'TESCO STORES')).toBe(true);
    expect(ruleMatches({ matchType: 'startsWith', pattern: 'stores' }, 'TESCO STORES')).toBe(false);
    expect(ruleMatches({ matchType: 'regex', pattern: '([' }, 'anything')).toBe(false);
  });

  it('merchantKey picks the meaningful word', () => {
    expect(merchantKey('PURCHASE AUTHORIZED ON 10/13 STARBUCKS STORE 05555 OAKLAND CA')).toBe('STARBUCKS');
    expect(merchantKey('Debit Card Purchase - KROGER #456 COLUMBUS OH')).toBe('KROGER');
    expect(merchantKey('Zelle payment to JOHN LANDLORD')).toBe('JOHN');
    expect(tidyDescription('WHOLE FOODS   MARKET')).toBe('Whole Foods Market');
    expect(tidyDescription('Pret A Manger')).toBe('Pret A Manger');
    expect(tidyDescription('NETFLIX.COM NETFLIX.COM CA')).toBe('Netflix.com Netflix.com Ca');
  });
});
