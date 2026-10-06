// The Start-Here PDFs (built by `npm run build:pdf`): both paper sizes exist, are 2 pages, carry real
// clickable links for the app and the demo, and use the download file name from the config.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    await doc.cleanup();
  });
}
