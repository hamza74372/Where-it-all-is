// Small RFC 4180 CSV parser (no dependencies, runs on the device).
// Handles quoted fields, "" escapes, newlines inside quotes, CRLF/LF/CR, a UTF-8 BOM,
// and picks the delimiter (comma, semicolon or tab) that splits the file most consistently.

export type Delimiter = ',' | ';' | '\t';

export interface ParsedCsv {
  rows: string[][];
  delimiter: Delimiter;
}

export function parseCsv(input: string, delimiter?: Delimiter): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // Drop rows that are completely empty (blank lines between sections).
    if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
    } else if (ch === d) endField();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (field !== '' || row.length) endRow();
  return { rows, delimiter: d };
}

/** Choose the delimiter whose per-line field counts are highest and most consistent (quotes respected). */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  let best: { d: Delimiter; score: number } = { d: ',', score: -1 };
  for (const d of [',', ';', '\t'] as Delimiter[]) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    if (!counts.some((c) => c > 0)) continue;
    // Most common count among lines, weighted by how many lines share it.
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = mode === 0 ? 0 : times * 100 + mode;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}
