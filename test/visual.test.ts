import { describe, expect, it } from 'vitest';
import { progressPercent, toneClass } from '../src/ui/Visual';

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
});
