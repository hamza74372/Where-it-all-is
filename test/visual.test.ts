import { describe, expect, it } from 'vitest';
import { donutArcs, progressArc, progressPercent, shouldUseDonut, toneClass } from '../src/ui/Visual';

describe('visual components', () => {
  it('keeps progress drawings inside their accessible 0–100 range', () => {
    expect(progressPercent(-0.25)).toBe(0);
    expect(progressPercent(0.42)).toBe(42);
    expect(progressPercent(1.5)).toBe(100);
  });

  it('cycles every category through the stable eight-colour palette', () => {
    expect(Array.from({ length: 8 }, (_, index) => toneClass(index))).toEqual([
      'tone-0', 'tone-1', 'tone-2', 'tone-3', 'tone-4', 'tone-5', 'tone-6', 'tone-7',
    ]);
    expect(toneClass(8)).toBe('tone-0');
  });

  it('uses calm bars instead of a donut for fewer than two categories', () => {
    expect(shouldUseDonut(0)).toBe(false);
    expect(shouldUseDonut(1)).toBe(false);
    expect(shouldUseDonut(2)).toBe(true);
  });

  it('draws the elapsed share as a partial arc', () => {
    const arc = progressArc((14 - 3) / 14);
    expect(arc.length).toBeCloseTo(78.57, 2);
    expect(arc.offset).toBeCloseTo(21.43, 2);
  });

  it('gives donut segments distinct tones and visible gaps', () => {
    const arcs = donutArcs([
      { label: 'Groceries', value: 55, display: '$55', tone: 0 },
      { label: 'Coffee', value: 25, display: '$25', tone: 2 },
      { label: 'Transport', value: 20, display: '$20', tone: 3 },
    ]);
    expect(arcs.map((arc) => arc.tone)).toEqual([0, 2, 3]);
    expect(arcs.every((arc) => arc.length > 0 && arc.length < 55)).toBe(true);
    expect(arcs[1].offset).toBeLessThan(arcs[0].offset);
  });
});
