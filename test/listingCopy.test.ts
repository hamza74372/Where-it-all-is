// The Etsy listing copy (scripts/listing/copy.json) follows the shop's rules.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const copy = JSON.parse(fs.readFileSync('scripts/listing/copy.json', 'utf8'));
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.entries(v).filter(([k]) => k !== '_readme' && k !== 'file').flatMap(([, x]) => strings(x)) : [];
const all = strings(copy);

describe('listing copy', () => {
  it('has 12 images and 2 videos, each with a headline and a unique file', () => {
    expect(copy.images).toHaveLength(12);
    expect(copy.videos).toHaveLength(2);
    const files = [...copy.images, ...copy.videos].map((x: { file: string }) => x.file);
    expect(new Set(files).size).toBe(files.length);
    for (const x of [...copy.images, ...copy.videos]) expect(x.headline.length).toBeGreaterThan(0);
  });

  it('ADHD only as "ADHD-friendly"; never treats, manages or reduces', () => {
    for (const s of all) {
      expect(s.replace(/ADHD-friendly/g, '')).not.toMatch(/ADHD/i);
      expect(s).not.toMatch(/\b(treat|treats|treating|manage|manages|managing|reduce|reduces|reducing|cure|cures)\b/i);
    }
  });

  it('no stars, ratings or reviews; never "behind" or "missed"', () => {
    for (const s of all) expect(s).not.toMatch(/★|☆|\b(stars?|reviews?|rated|ratings?|5\/5|bestsell\w*|behind|missed)\b/i);
  });

  it('no made-up numbers: the only figures are the typing example and the paper size', () => {
    const numbers = all.flatMap((s) => s.match(/\d+(?:[.,]\d+)*%?/g) ?? []);
    expect([...new Set(numbers)].sort()).toEqual(['4', '4.50'].sort()); // "4.50 coffee", "A4"
  });

  it('the download and demo lines are on "What you get"', () => {
    const last = strings(copy.images[11]).join(' ');
    expect(last).toContain('DIGITAL DOWNLOAD — no physical item');
    expect(last).toContain('Download on Etsy.com in a web browser, not the Etsy app.');
    expect(last).toContain('Try the free demo first — link in the description.');
  });
});
