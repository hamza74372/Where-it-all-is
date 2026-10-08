import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = fs.readFileSync(path.resolve(__dirname, '../src/tokens.css'), 'utf8');

function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('accent theme contrast', () => {
  const heroText = tokens.match(/--hero-text:\s*(#[0-9A-F]{6})/i)?.[1] ?? '';
  for (const name of ['navy', 'sage', 'plum', 'ocean', 'sand']) {
    it(`${name} accent and hero colours meet WCAG AA`, () => {
      const block = tokens.match(new RegExp(`\\[data-accent='${name}'\\] \\{([\\s\\S]*?)\\}`))?.[1];
      expect(block).toBeTruthy();
      const value = (token: string) => block!.match(new RegExp(`--${token}:\\s*(#[0-9A-F]{6})`, 'i'))?.[1] ?? '';
      const text = value('theme-on-accent');
      for (const token of ['theme-accent', 'theme-hero-start', 'theme-hero-end']) {
        expect(contrast(value(token), text), `${name} ${token}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const token of ['theme-hero-start', 'theme-hero-end']) {
        expect(contrast(value(token), heroText), `${name} hero number on ${token}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
