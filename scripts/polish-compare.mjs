// Before/after sheets for the design polish: one image per state, light and dark, before and
// after (from docs/polish/before and docs/polish/after, made by audit/polish.audit.ts).
// Run: node scripts/polish-compare.mjs  → docs/polish/compare-*.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'docs/polish';
const uri = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const has = (f) => fs.existsSync(f);

const STATES = [
  ['today-filled', 'Today (filled)'],
  ['today-tight', 'Today (tight)'],
  ['today-empty', 'Today (empty)'],
  ['log-search', 'Log with search'],
  ['bills', 'Bills'],
  ['plan', 'Plan'],
  ['import-preview', 'Import preview'],
  ['your-data', 'Your data'],
  ['welcome', 'Welcome screen'],
];

const CSS = `
  body { margin:0; background:#E9E4D9; font: 15px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color:#1F2A44; }
  .sheet { padding: 28px; display:grid; gap: 16px; width: max-content; }
  h1 { margin:0; font-size: 22px; font-weight: 650; }
  .grid { display:grid; grid-template-columns: repeat(4, 300px); gap: 16px; }
  figure { margin:0; display:grid; gap: 6px; }
  figcaption { font-size: 13px; font-weight: 600; opacity:.75; }
  figure img { width: 300px; border-radius: 14px; box-shadow: 0 1px 3px rgb(0 0 0 / 15%); display:block; }
  .home { width: 300px; height: 300px; border-radius: 14px; display:grid; grid-template-columns: repeat(4, 1fr); align-content:center; gap: 18px 6px; padding: 18px; box-sizing:border-box; }
  .home.light { background: linear-gradient(160deg, #E8DCCB, #CFE3DC); }
  .home.dark { background: linear-gradient(160deg, #0E1424, #22324A); }
  .app { display:grid; justify-items:center; gap: 5px; font-size: 11px; }
  .home.light .app { color:#1F2A44; } .home.dark .app { color:#F7F3EA; }
  .tile { width: 56px; height: 56px; border-radius: 13px; overflow:hidden; background: rgb(255 255 255 / 35%); }
  .tile img { width: 56px; height: 56px; display:block; }
  .pdf img { width: 460px; }
  .pdfgrid { display:grid; grid-template-columns: repeat(2, 460px); gap: 16px; }
`;

const fig = (label, file) => (has(file) ? `<figure><figcaption>${label}</figcaption><img src="${uri(file)}"></figure>` : `<figure><figcaption>${label} — not captured</figcaption></figure>`);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function save(html, file) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.setContent(`<!doctype html><html><head><style>${CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
  await page.locator('.sheet').screenshot({ path: path.join(DIR, file) });
}

for (const [key, title] of STATES) {
  await save(
    `<div class="sheet"><h1>${title}</h1><div class="grid">
      ${fig('Before · light', `${DIR}/before/light/${key}.png`)}
      ${fig('Before · dark', `${DIR}/before/dark/${key}.png`)}
      ${fig('After · light', `${DIR}/after/light/${key}.png`)}
      ${fig('After · dark', `${DIR}/after/dark/${key}.png`)}
    </div></div>`,
    `compare-${key}.png`,
  );
}

// The home-screen icon, among neighbours on a light and a dark wallpaper.
const home = (icon, theme) => {
  const dummy = (name) => `<div class="app"><div class="tile"></div><span>${name}</span></div>`;
  return `<div class="home ${theme}">${dummy('Mail')}${dummy('Photos')}<div class="app"><div class="tile"><img src="${uri(icon)}"></div><span>Where It All Is</span></div>${dummy('Maps')}${dummy('Notes')}${dummy('Clock')}${dummy('Music')}${dummy('Files')}</div>`;
};
const oldIcon = `${DIR}/before/icon-192.png`;
const newIcon = 'branding/png/app-icon-180.png';
await save(
  `<div class="sheet"><h1>Home-screen icon</h1><div class="grid">
    <figure><figcaption>Before · light</figcaption>${home(oldIcon, 'light')}</figure>
    <figure><figcaption>Before · dark</figcaption>${home(oldIcon, 'dark')}</figure>
    <figure><figcaption>After · light</figcaption>${home(newIcon, 'light')}</figure>
    <figure><figcaption>After · dark</figcaption>${home(newIcon, 'dark')}</figure>
  </div></div>`,
  'compare-home-icon.png',
);

// PDF page 1 (print has one look, so no dark version).
await save(
  `<div class="sheet"><h1>Start-Here PDF, page 1 (Letter)</h1><div class="pdfgrid">
    <figure class="pdf"><figcaption>Before</figcaption><img src="${uri(`${DIR}/before/pdf-page-1.png`)}"></figure>
    <figure class="pdf"><figcaption>After</figcaption><img src="${uri(`${DIR}/after/pdf-page-1.png`)}"></figure>
  </div></div>`,
  'compare-pdf-page-1.png',
);
await browser.close();
console.log(`${STATES.length + 2} comparison sheets in ${DIR}/`);
