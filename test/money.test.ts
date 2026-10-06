import { describe, expect, it } from 'vitest';
import {
  allocate, amountExample, decimalMarkFor, divFloor, formatMoney, mulRound, parseAmount, parseAmountStrict, sum, toDecimalString, toInputString,
  type AmountParse,
} from '../src/lib/money';

const ok = (value: number): AmountParse => ({ kind: 'ok', value });
const confirm = (suggested: number, literal: number | null = null): AmountParse => ({ kind: 'confirm', suggested, literal });
const invalid: AmountParse = { kind: 'invalid' };

describe('parseAmount — "." decimal (USD/GBP/CAD/AUD)', () => {
  const cases: Array<[string, AmountParse]> = [
    ['12', ok(1200)], ['12.5', ok(1250)], ['12.50', ok(1250)], ['0.07', ok(7)], ['.5', ok(50)], ['12.', ok(1200)],
    ['1,234.56', ok(123456)], ['1,234', ok(123400)], ['1,234,567.89', ok(123456789)],
    ['£12.50', ok(1250)], ['$1,000', ok(100000)], ['USD 5', ok(500)],
    ['-3', ok(-300)], ['(12.50)', ok(-1250)], ['12.50-', ok(-1250)], ['-$4.20', ok(-420)], ['$-4.20', ok(-420)],
    ['0', ok(0)], ['-0', ok(0)], ['12.3456', ok(1235)], ['1234.567', ok(123457)], ['0.125', ok(13)],
    // Unusual for this format → ask instead of guessing.
    ['1.234', confirm(123400, 123)], ['12.345', confirm(1234500, 1235)], ['-1.234', confirm(-123400, -123)],
    ['12,50', confirm(1250)], ['1.234,56', confirm(123456)], ['1.234.567', confirm(123456700)], ['€ 9,99', confirm(999)],
    ['', invalid], ['abc', invalid], ['1,23,4', invalid], ['12.5.6', invalid], ['-', invalid],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)}`, () => expect(parseAmount(input, '.')).toEqual(expected));
  }
});

describe('parseAmount — "," decimal (most EUR locales)', () => {
  const cases: Array<[string, AmountParse]> = [
    ['12,50', ok(1250)], ['9,99 €', ok(999)], ['1.234', ok(123400)], ['1.234,56', ok(123456)],
    ['1.234.567', ok(123456700)], ['-3', ok(-300)], ['(12,50)', ok(-1250)],
    ['12.50', confirm(1250)], ['1,234.56', confirm(123456)], ['1,234', confirm(123400, 123)],
    ['1.23.4', invalid],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)}`, () => expect(parseAmount(input, ',')).toEqual(expected));
  }
});

describe('parseAmountStrict (CSV files with a detected format)', () => {
  it('takes the literal reading in the given format', () => {
    expect(parseAmountStrict('1.234', '.')).toBe(123);
    expect(parseAmountStrict('1.234', ',')).toBe(123400);
    expect(parseAmountStrict('-1.234,56', ',')).toBe(-123456);
    expect(parseAmountStrict('12,50', '.')).toBeNull();
  });
});

describe('decimalMarkFor', () => {
  it('reads the mark from the locale', () => {
    expect(decimalMarkFor('en-US')).toBe('.');
    expect(decimalMarkFor('en-GB')).toBe('.');
    expect(decimalMarkFor('de-DE')).toBe(',');
    expect(decimalMarkFor('fr-FR')).toBe(',');
    expect(decimalMarkFor('en-IE')).toBe('.');
  });
});

describe('integer helpers', () => {
  it('sum', () => expect(sum([1050, -250, 7])).toBe(807));
  it('divFloor rounds toward -∞', () => {
    expect(divFloor(1000, 3)).toBe(333);
    expect(divFloor(-1000, 3)).toBe(-334);
  });
  it('allocate adds back exactly', () => {
    const parts = allocate(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(sum(parts)).toBe(1000);
  });
  it('mulRound', () => {
    expect(mulRound(100000, 0.229 / 12)).toBe(1908);
    expect(mulRound(-5, 0.5)).toBe(-3);
  });
  it('toDecimalString', () => {
    expect(toDecimalString(123450)).toBe('1234.50');
    expect(toDecimalString(-5)).toBe('-0.05');
  });
});

describe('formatMoney', () => {
  it('formats per currency/locale', () => {
    expect(formatMoney(21400, 'USD', 'en-US')).toBe('$214.00');
    expect(formatMoney(21400, 'USD', 'en-US', { wholeIfRound: true })).toBe('$214');
    expect(formatMoney(123456, 'GBP', 'en-GB')).toBe('£1,234.56');
    expect(formatMoney(-1250, 'EUR', 'en-IE')).toBe('-€12.50');
    expect(formatMoney(999, 'AUD', 'en-AU')).toBe('$9.99');
    expect(formatMoney(999, 'CAD', 'en-CA')).toBe('$9.99');
    expect(formatMoney(500, 'USD', 'en-US', { signed: true })).toBe('+$5.00');
  });
});

describe('amountExample', () => {
  it('shows how amounts are typed', () => {
    expect(amountExample('.')).toBe('12.50');
    expect(amountExample(',')).toBe('12,50');
  });
});

describe('formatMoney follows the user decimal setting', () => {
  it('swaps marks when the setting differs from the locale', () => {
    expect(formatMoney(123456, 'USD', 'en-US', { decimal: ',' })).toBe('$1.234,56');
    expect(formatMoney(123456, 'USD', 'en-US', { decimal: '.' })).toBe('$1,234.56');
    expect(formatMoney(123456, 'EUR', 'de-DE', { decimal: '.' })).toBe('1,234.56 €');
    expect(formatMoney(123456, 'EUR', 'de-DE', { decimal: ',' })).toBe('1.234,56 €');
  });
  it('toInputString', () => {
    expect(toInputString(123450, ',')).toBe('1234,50');
    expect(toInputString(-5, '.')).toBe('-0.05');
  });
});
