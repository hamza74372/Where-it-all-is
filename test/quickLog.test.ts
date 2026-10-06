import { describe, expect, it } from 'vitest';
import type { Category } from '../src/db/types';
import { DEFAULT_CATEGORIES } from '../src/data/defaults';
import { matchCategory, parseQuickLog } from '../src/lib/quickLog';

const cats: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
  id: c.name, name: c.name, emoji: c.emoji, color: c.color, order: i, archived: false, updatedAt: 0,
}));
const cat = (text: string) => matchCategory(text, cats)?.name;

describe('parseQuickLog', () => {
  it('amount then words', () => {
    expect(parseQuickLog('25 groceries', cats, '.')).toEqual({
      kind: 'ok', amount: 2500, direction: 'out', categoryId: 'Groceries', note: 'Groceries',
    });
  });
  it('decimal amount, keyword category', () => {
    const r = parseQuickLog('12.50 coffee', cats, '.');
    expect(r).toMatchObject({ kind: 'ok', amount: 1250, categoryId: 'Eating out', note: 'Coffee' });
  });
  it('words then amount, currency symbol', () => {
    expect(parseQuickLog('uber £8.40', cats, '.')).toMatchObject({ amount: 840, categoryId: 'Transport', note: 'Uber' });
  });
  it('comma-decimal users', () => {
    expect(parseQuickLog('12,50 Kaffee', cats, ',')).toMatchObject({ amount: 1250 });
  });
  it('"+" means money in', () => {
    expect(parseQuickLog('+40 refund', cats, '.')).toMatchObject({ amount: 4000, direction: 'in', note: 'Refund' });
  });
  it('unusual amount asks to confirm', () => {
    expect(parseQuickLog('1.234 rent', cats, '.')).toMatchObject({
      amount: 123400, confirm: { suggested: 123400, literal: 123 },
    });
  });
  it('no amount / empty', () => {
    expect(parseQuickLog('coffee', cats, '.')).toEqual({ kind: 'noAmount', text: 'coffee' });
    expect(parseQuickLog('   ', cats, '.')).toEqual({ kind: 'empty' });
  });
  it('amount only: no category', () => {
    expect(parseQuickLog('7', cats, '.')).toEqual({ kind: 'ok', amount: 700, direction: 'out', categoryId: undefined, note: '' });
  });
});

describe('matchCategory', () => {
  it('matches names, prefixes, keywords and typos', () => {
    expect(cat('groceries')).toBe('Groceries');
    expect(cat('groc')).toBe('Groceries');
    expect(cat('grocerys')).toBe('Groceries');
    expect(cat('tesco')).toBe('Groceries');
    expect(cat('lunch with sam')).toBe('Eating out');
    expect(cat('netflix')).toBe('Subscriptions');
    expect(cat('petrol')).toBe('Transport');
    expect(cat('vet bill')).toBe('Kids & pets');
    expect(cat('council tax')).toBe('Bills');
    expect(cat('fun')).toBe('Fun');
  });
  it('returns nothing rather than a bad guess', () => {
    expect(cat('xyzzy')).toBeUndefined();
    expect(cat('a')).toBeUndefined();
  });
  it('ignores archived categories', () => {
    const archived = cats.map((c) => (c.name === 'Groceries' ? { ...c, archived: true } : c));
    expect(matchCategory('groceries', archived)?.name).not.toBe('Groceries');
  });
});
