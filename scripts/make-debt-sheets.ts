// Generates docs/debt-check-*.csv: spreadsheets with live formulas that reproduce the app's
// debt maths, so it can be checked in Excel / Google Sheets / Numbers.
// The "App says" cells come from the app's own engine (src/lib/debt.ts).
// Run: npm run sheets
import fs from 'node:fs';
import { simulatePayoff } from '../src/lib/debt';

type Cell = string | number;
const q = (v: Cell) => (typeof v === 'string' && /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: Cell[][]) => rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
const ROWS = 60;
const money = (minor: number) => minor / 100;

const one = simulatePayoff([{ id: 'card', name: 'Card', balance: 500000, apr: 18, minPayment: 20000 }], 'snowball');
const two = simulatePayoff(
  [
    { id: 'target', name: 'Target', balance: 100000, apr: 24, minPayment: 5000 },
    { id: 'other', name: 'Other', balance: 300000, apr: 15, minPayment: 9000 },
  ],
  'snowball',
  6000,
);
fs.mkdirSync('docs', { recursive: true });

// ---- Sheet 1: one debt ----
{
  const rows: Cell[][] = [
    ['Balance', 5000, 'APR %', 18, 'Monthly payment', 200],
    [],
    ['Month', 'Start', 'Interest', 'Payment', 'End'],
  ];
  for (let i = 0; i < ROWS; i++) {
    const r = i + 4;
    rows.push([
      i + 1,
      i === 0 ? '=B1' : `=E${r - 1}`,
      `=ROUND(B${r}*$D$1/100/12,2)`,
      `=MIN($F$1,B${r}+C${r})`,
      `=B${r}+C${r}-D${r}`,
    ]);
  }
  const last = ROWS + 3;
  rows.push([]);
  rows.push(['Months to pay off', `=COUNTIF(D4:D${last},">0")`, '', 'App says', one.months!]);
  rows.push(['Total interest', `=SUM(C4:C${last})`, '', 'App says', money(one.totalInterest)]);
  fs.writeFileSync('docs/debt-check-one-debt.csv', csv(rows));
}

// ---- Sheet 2: two debts, snowball (smaller balance first) with rollover ----
{
  const rows: Cell[][] = [
    ['Target debt (smaller balance)', 1000, 'APR %', 24, 'Minimum', 50],
    ['Other debt', 3000, 'APR %', 15, 'Minimum', 90],
    ['Total monthly budget (minimums + 60 extra)', 200],
    [],
    ['Month', 'Target start', 'Target interest', 'Target payment', 'Target end', 'Other start', 'Other interest', 'Other payment', 'Other end'],
  ];
  for (let i = 0; i < ROWS; i++) {
    const r = i + 6;
    rows.push([
      i + 1,
      i === 0 ? '=B1' : `=E${r - 1}`,
      `=ROUND(B${r}*$D$1/100/12,2)`,
      `=MIN(B${r}+C${r},$B$3-MIN($F$2,F${r}+G${r}))`,
      `=B${r}+C${r}-D${r}`,
      i === 0 ? '=B2' : `=I${r - 1}`,
      `=ROUND(F${r}*$D$2/100/12,2)`,
      `=MIN(F${r}+G${r},$B$3-D${r})`,
      `=F${r}+G${r}-H${r}`,
    ]);
  }
  const last = ROWS + 5;
  rows.push([]);
  rows.push(['Months to pay off', `=MAX(COUNTIF(D6:D${last},">0"),COUNTIF(H6:H${last},">0"))`, '', 'App says', two.months!]);
  rows.push(['Total interest', `=SUM(C6:C${last})+SUM(G6:G${last})`, '', 'App says', money(two.totalInterest)]);
  fs.writeFileSync('docs/debt-check-two-debts.csv', csv(rows));
}
console.log('wrote docs/debt-check-one-debt.csv, docs/debt-check-two-debts.csv');
