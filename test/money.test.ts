import { describe, expect, it } from 'vitest';
import { allocate, divFloor, formatMoney, mulRound, parseAmount, sum, toDecimalString } from '../src/lib/money';

describe('parseAmount', () => {
  const cases: Array<[string, number | null]> = [
    ['12', 1200], ['12.5', 1250], ['12.50', 1250], ['0.07', 7], ['.5', 50], ['12.', 1200],
    ['1,234.56', 123456], ['1.234,56', 123456], ['12,50', 1250], ['1,234', 123400], ['1.234.567', 123456700],
    ['1,234,567.89', 123456789], ['£12.50', 1250], ['$1,000', 100000], ['€ 9,99', 999], ['USD 5', 500],
    ['-3', -300], ['(12.50)', -1250], ['12.50-', -1250], ['-$4.20', -420], ['$-4.20', -420],
    ['12.345', 1234500], ['12.3456', 1235], ['-12.3456', -1235], ['0', 0], ['-0', 0], ['', null], ['abc', null], ['1,23,4', null], ['12.5.6', null],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => expect(parseAmount(input)).toBe(expected));
  }
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
