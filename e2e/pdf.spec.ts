// The Start-Here PDFs (built by `npm run build:pdf`): both paper sizes exist, are 2 pages, carry real
// clickable links for the app and the demo, and use the download file name from the config.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
// @ts-expect-error plain .mjs build helper
import { readZip } from '../scripts/zip.mjs';

const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8'));
const site = cfg.siteUrl.replace(/\/$/, '');
const APP_URL = `${site}/${cfg.appPath}/`;
const DEMO_URL = `${site}/demo/`;

for (const paper of ['Letter', 'A4']) {
  test(`Start-Here-${paper}.pdf: 2 pages, clickable app and demo links`, async () => {
    const file = `dist/Start-Here-${paper}.pdf`;
    test.skip(!fs.existsSync(file), 'run `npm run build:pdf` first');
    const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
    expect(doc.numPages).toBe(2);

    const links: string[] = [];
    let text = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      for (const a of await page.getAnnotations()) if (a.subtype === 'Link' && a.url) links.push(a.url);
      text += (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join('');
    }
    expect(links).toContain(APP_URL);
    expect(links).toContain(DEMO_URL);
    expect(links.every((l) => l === APP_URL || l === DEMO_URL)).toBe(true);

    const flat = text.replace(/\s+/g, '');
    expect(flat).toContain(cfg.downloadFileName);
    expect(flat).toContain('Scanwithyourphonecamera');
    expect(flat).toContain('Yourfirstweek');
    expect(flat).toContain('(macOS14orlater)');
    expect(flat).toContain('DownloadonEtsy.cominawebbrowser,nottheEtsyapp.');
    expect(flat).toContain(cfg.zipFileName);
    // CT-05: the link opens the app; the numbers live only in this browser.
    expect(flat).toContain('Thislinkopenstheapp.Yournumbersaresavedonlyinthisbrowseronthisdevice,unlessyoumakeabackup.');
    expect(flat).not.toContain('personalcopy');
    await doc.cleanup();
  });
}

test('Where-It-All-Is.zip: the Etsy download holds the app and both guides', async () => {
  const file = `dist/${cfg.zipFileName}`;
  test.skip(!fs.existsSync(file), 'run `npm run build:pdf` first');
  expect(cfg.zipFileName).toBe('Where-It-All-Is.zip');
  const files: Map<string, Buffer> = readZip(fs.readFileSync(file));
  expect([...files.keys()].sort()).toEqual([cfg.downloadFileName, 'Start-Here-A4.pdf', 'Start-Here-Letter.pdf'].sort());
  // Byte-for-byte the files the build made (CRC checked on read).
  expect(files.get(cfg.downloadFileName)!.equals(fs.readFileSync('dist/app.html'))).toBe(true);
  for (const paper of ['Letter', 'A4']) expect(files.get(`Start-Here-${paper}.pdf`)!.equals(fs.readFileSync(`dist/Start-Here-${paper}.pdf`))).toBe(true);
  expect(files.get(cfg.downloadFileName)!.toString('utf8', 0, 200)).toMatch(/<!doctype html>/i);
});
