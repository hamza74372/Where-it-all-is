// The design system holds: raw px and colour values live only in src/tokens.css. Everything
// else uses the tokens (var(--space-3), var(--text), …), so one change there restyles the app.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../src');
const TOKENS = path.join(SRC, 'tokens.css');

function files(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, ext) : ext.test(e.name) ? [p] : [];
  });
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const RAW = [
  { name: 'px value', re: /(?<![\w-])\d*\.?\d+px\b/g },
  { name: 'hex colour', re: /#[0-9a-f]{3,8}\b/gi },
  { name: 'rgb/hsl colour', re: /\b(?:rgba?|hsla?)\(/gi },
  { name: 'named colour', re: /:\s*(?:white|black)\b/gi },
];

function offenders(text: string): string[] {
  return text.split('\n').flatMap((line, i) =>
    RAW.flatMap(({ name, re }) => (line.match(re) ? [`line ${i + 1}: ${name} — ${line.trim()}`] : [])),
  );
}

describe('design tokens', () => {
  it('stylesheets use only tokens (no raw px or colours outside tokens.css)', () => {
    const css = files(SRC, /\.css$/).filter((f) => f !== TOKENS);
    expect(css.length).toBeGreaterThanOrEqual(4);
    const problems = css.flatMap((f) => offenders(stripComments(fs.readFileSync(f, 'utf8'))).map((p) => `${path.basename(f)} ${p}`));
    expect(problems).toEqual([]);
  });

  it('components set no raw px or colours in inline styles', () => {
    const problems = files(SRC, /\.tsx$/).flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => /style=\{\{/.test(l))
        .flatMap((l) => offenders(l).map((p) => `${path.basename(f)}: ${p}`)),
    );
    expect(problems).toEqual([]);
  });

  it('the token file defines the agreed scales', () => {
    const t = fs.readFileSync(TOKENS, 'utf8');
    const count = (re: RegExp) => (t.match(re) ?? []).length;
    expect(count(/--space-\d:/g)).toBe(7);
    expect(count(/--text-(hero|title|heading|body|small|label):/g)).toBe(6);
    expect(count(/--radius-(sm|md|lg|full):/g)).toBe(4);
    // Three shadows, defined once per theme block (light, dark, dark-by-system).
    expect(count(/--shadow-[012]:/g)).toBe(9);
    for (const role of ['--bg', '--surface', '--text', '--text-muted', '--primary', '--accent', '--link', '--danger', '--focus']) {
      expect(t, role).toContain(`${role}:`);
    }
  });

  it('mint is never text on cream: the light theme link colour is a darker, text-safe green', () => {
    const light = fs.readFileSync(TOKENS, 'utf8').split("[data-theme='midnight']")[0];
    const link = light.match(/--link:\s*(#[0-9a-f]{6})/i)![1].toUpperCase();
    expect(link).not.toBe('#7CC8B5');
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(ratio(link, '#F7F3EA')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#7CC8B5', '#F7F3EA')).toBeLessThan(4.5); // why the rule exists
  });
});
