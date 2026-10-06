// Render each page of a PDF to PNG with pdf.js in Chromium — to check what the printed PDF really
// looks like (not just the HTML it came from). Dev tool only.
// Usage: node scripts/render-pdf-pages.mjs dist/Start-Here-Letter.pdf screenshots/phase6/pdf-letter
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [pdfPath = 'dist/Start-Here-Letter.pdf', outPrefix = 'screenshots/phase6/pdf-letter'] = process.argv.slice(2);
const files = {
  '/doc.pdf': [path.resolve(pdfPath), 'application/pdf'],
  '/pdf.mjs': [path.resolve('node_modules/pdfjs-dist/build/pdf.min.mjs'), 'text/javascript'],
  '/pdf.worker.mjs': [path.resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'text/javascript'],
  '/': [null, 'text/html'],
};
const page = `<!doctype html><body style="margin:0;background:#888"><div id="out"></div><script type="module">
  import * as pdfjs from '/pdf.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
  const doc = await pdfjs.getDocument({ url: '/doc.pdf' }).promise;
  for (let n = 1; n <= doc.numPages; n++) {
    const p = await doc.getPage(n);
    const vp = p.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height; c.id = 'page-' + n; c.style.display = 'block'; c.style.marginBottom = '10px';
    document.getElementById('out').appendChild(c);
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  document.body.dataset.pages = String(doc.numPages);
</script></body>`;
const server = http.createServer((req, res) => {
  const [file, type] = files[req.url] ?? [];
  if (!type) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': type }).end(file ? fs.readFileSync(file) : page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
tab.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
tab.on('pageerror', (e) => console.error('page error:', e.message));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => document.body.dataset.pages, null, { timeout: 30_000 });
const pages = Number(await tab.evaluate(() => document.body.dataset.pages));
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
for (let n = 1; n <= pages; n++) await tab.locator(`#page-${n}`).screenshot({ path: `${outPrefix}-page-${n}.png` });
await browser.close();
server.close();
console.log(`${pdfPath}: ${pages} pages → ${outPrefix}-page-1..${pages}.png`);
