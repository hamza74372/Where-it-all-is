// Brand: writes branding/*.svg (exact geometry), PNG exports, branding/preview.png, branding/ab.png,
// and src/ui/brandMarks.ts (the same path data, for the app). Run: node scripts/make-logo.mjs
//
// Geometry (mark units, centre line x = 60):
//   Body — envelope: top edge is a V (35°) down to a notch, straight sides, 45° taper to a round tip.
//   Flap — as wide as the body (variant B): flat top, small corners on the body's sides, bottom edge
//          parallel to the body's V, offset by GAP. Variant A (angled shoulders) is kept as logo-a.svg.
//   Even gap: the flap's V tip (radius R) and the body's notch (radius R + GAP) share one centre.
// Wordmark: Inter SemiBold (OFL), converted to outlines, so it looks the same everywhere.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const NAVY = '#1F2A44';
const MINT = '#7CC8B5';
const CREAM = '#F7F3EA';
const GAP = 8; // ≈7% of the mark's height: still a clear line on the 32 px app icon
const TIP_R = 3; // flap V tip
const NAME = 'Where It All Is';

const OUT = 'branding';
const PNG = path.join(OUT, 'png');
fs.mkdirSync(PNG, { recursive: true });

/* ---------- geometry ---------- */
const r2 = (n) => Math.round(n * 100) / 100;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const unit = (v) => [v[0] / len(v), v[1] / len(v)];

/** Closed polygon (traced clockwise on screen) with a fillet radius per vertex → SVG path data. */
function roundedPath(pts) {
  const n = pts.length;
  const corners = pts.map(([x, y, r], i) => {
    const V = [x, y];
    const P = pts[(i - 1 + n) % n];
    const Q = pts[(i + 1) % n];
    const a = unit(sub(P, V));
    const b = unit(sub(Q, V));
    const half = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) / 2;
    const t = r / Math.tan(half);
    const e1 = sub(V, P);
    const e2 = sub(Q, V);
    const convex = e1[0] * e2[1] - e1[1] * e2[0] > 0;
    return { r, inP: [x + a[0] * t, y + a[1] * t], outP: [x + b[0] * t, y + b[1] * t], sweep: convex ? 1 : 0 };
  });
  const f = (p) => `${r2(p[0])} ${r2(p[1])}`;
  let d = `M${f(corners[0].outP)}`;
  for (let i = 1; i <= n; i++) {
    const c = corners[i % n];
    d += `L${f(c.inP)}A${c.r} ${c.r} 0 0 ${c.sweep} ${f(c.outP)}`;
  }
  return d + 'Z';
}

const slope = 34 / 48; // top V: 48 across, 34 down (≈35°)
const halfAngle = Math.atan2(48, 34); // half the notch angle
const notchY = 80;
const body = [
  [12, 46, 5], // top-left corner
  [60, notchY, TIP_R + GAP], // notch (concave) — concentric with the flap tip
  [108, 46, 5], // top-right corner
  [108, 94, 14], // side → taper (gentle, keeps the sides straight)
  [60, 142, 10], // pin tip: 90°, round, not pencil-sharp
  [12, 94, 14],
];
const flapTipY = notchY - GAP / Math.sin(halfAngle);
const yOnOffset = (x) => flapTipY - Math.abs(x - 60) * slope;
const flapB = [
  [12, 24, 5], // top-left, on the body's left side
  [108, 24, 5], // top-right, on the body's right side
  [108, yOnOffset(108), 4],
  [60, flapTipY, TIP_R],
  [12, yOnOffset(12), 4],
];
const flapA = [
  [34, 24, 14], // angled shoulders (variant A)
  [86, 24, 14],
  [101, yOnOffset(101), 4],
  [60, flapTipY, TIP_R],
  [19, yOnOffset(19), 4],
];
const BODY_D = roundedPath(body);
const FLAP_D = roundedPath(flapB);
const FLAP_A_D = roundedPath(flapA);
const TIP_BOTTOM = 142 - 10 * (Math.SQRT2 - 1); // lowest point of the rounded tip
const content = { x: 12, y: 24, w: 96, h: TIP_BOTTOM - 24 }; // the mark's ink box
const VIEW = `${content.x - 4} ${content.y - 4} ${content.w + 8} ${r2(content.h + 8)}`;

/* ---------- SVG building ---------- */
const header = (w, h, vb, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}" role="img" aria-label="${title}">\n  <title>${title}</title>`;
const markPaths = (bodyFill, flapFill, flapD = FLAP_D) => `<path fill="${flapFill}" d="${flapD}"/>\n  <path fill="${bodyFill}" d="${BODY_D}"/>`;
const markSvg = (bodyFill, flapFill, flapD) => `${header(416, r2((content.h + 8) * 4), VIEW, NAME)}\n  ${markPaths(bodyFill, flapFill, flapD)}\n</svg>\n`;

/** The mark placed in a square of `size`, scaled so its height (or width) is a share of the square. */
function placed(size, share, by, bodyFill) {
  const scale = by === 'height' ? (size * share) / content.h : (size * share) / content.w;
  const tx = size / 2 - (content.x + content.w / 2) * scale;
  const ty = size / 2 - (content.y + content.h / 2) * scale;
  return `<g transform="translate(${r2(tx)} ${r2(ty)}) scale(${r2(scale)})">\n    ${markPaths(bodyFill, MINT).replace(/\n  /g, '\n    ')}\n  </g>`;
}
const TILE = 1024;
// App icon (home screen): rounded navy tile, mark 65% of the tile's height.
const appIcon = `${header(TILE, TILE, `0 0 ${TILE} ${TILE}`, `${NAME} app icon`)}
  <rect width="${TILE}" height="${TILE}" rx="230" fill="${NAVY}"/>
  ${placed(TILE, 0.65, 'height', CREAM)}
</svg>
`;
// Square, full-bleed: for anything that crops it itself — the Etsy circle and Android's maskable
// icon. The mark is 55% of the width, inside the round safe zone.
const appIconSquare = `${header(TILE, TILE, `0 0 ${TILE} ${TILE}`, NAME)}
  <rect width="${TILE}" height="${TILE}" fill="${NAVY}"/>
  ${placed(TILE, 0.55, 'width', CREAM)}
</svg>
`;

/* ---------- wordmark: Inter SemiBold outlines ---------- */
const font = opentype.parse(fs.readFileSync('node_modules/@fontsource/inter/files/inter-latin-600-normal.woff').buffer);
const FONT_SIZE = 48;
const capHeight = (font.tables.os2.sCapHeight / font.unitsPerEm) * FONT_SIZE;
const MARK_H = 60; // the mark's height in the wordmark
const markScale = MARK_H / content.h;
const markW = content.w * markScale;
const TEXT_X = markW + 18;
const baseline = MARK_H / 2 + capHeight / 2;
// Laid out glyph by glyph (opentype.js can't parse one of Inter's substitution tables, and this
// name needs no ligatures), with the font's kerning between each pair.
const textPath = new opentype.Path();
{
  const units = FONT_SIZE / font.unitsPerEm;
  const glyphs = [...NAME].map((ch) => font.charToGlyph(ch));
  let x = TEXT_X;
  glyphs.forEach((g, i) => {
    textPath.extend(g.getPath(x, baseline, FONT_SIZE));
    x += g.advanceWidth * units;
    if (glyphs[i + 1]) x += font.getKerningValue(g, glyphs[i + 1]) * units;
  });
}
const textD = textPath.toPathData(2);
const tb = textPath.getBoundingBox();
const WM_W = Math.ceil(tb.x2 + 2);
const WM_H = MARK_H;
const wmMark = (bodyFill) =>
  `<g transform="translate(${r2(-content.x * markScale)} ${r2(-content.y * markScale)}) scale(${r2(markScale)})">\n    ${markPaths(bodyFill, MINT).replace(/\n  /g, '\n    ')}\n  </g>`;
const wordmarkSvg = (bodyFill, textFill) => `${header(WM_W * 2, WM_H * 2, `0 0 ${WM_W} ${WM_H}`, NAME)}
  ${wmMark(bodyFill)}
  <path fill="${textFill}" d="${textD}"/>
</svg>
`;
const wordmark = wordmarkSvg(NAVY, NAVY);
const wordmarkReverse = wordmarkSvg(CREAM, CREAM);

/* ---------- write files ---------- */
for (const old of ['logo-b.svg', 'app-icon-b.svg', 'app-icon-square-b.svg']) fs.rmSync(path.join(OUT, old), { force: true });
for (const f of fs.readdirSync(PNG)) if (/-b-\d+\.png$/.test(f)) fs.rmSync(path.join(PNG, f));
const logo = markSvg(NAVY, MINT);
const files = {
  'logo.svg': logo,
  'logo-mono.svg': markSvg(NAVY, NAVY),
  'logo-reverse.svg': markSvg(CREAM, MINT),
  'logo-a.svg': markSvg(NAVY, MINT, FLAP_A_D),
  'app-icon.svg': appIcon,
  'app-icon-square.svg': appIconSquare,
  'wordmark.svg': wordmark,
  'wordmark-reverse.svg': wordmarkReverse,
};
for (const [name, svg] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), svg);

// The same geometry for the app (welcome screen, loading screen, favicon).
fs.writeFileSync(
  'src/ui/brandMarks.ts',
  `// Generated by scripts/make-logo.mjs — do not edit by hand.
// The brand mark (flap + envelope body) and the outlined wordmark text (Inter SemiBold).

export const MARK = {
  viewBox: '${VIEW}',
  flap: '${FLAP_D}',
  body: '${BODY_D}',
};

export const WORDMARK = {
  viewBox: '0 0 ${WM_W} ${WM_H}',
  /** Places the mark (in MARK units) at the left of the wordmark. */
  markTransform: 'translate(${r2(-content.x * markScale)} ${r2(-content.y * markScale)}) scale(${r2(markScale)})',
  text: '${textD}',
};
`,
);

/* ---------- PNGs, preview, A/B (rendered by Chromium) ---------- */
const browser = await chromium.launch();
const page = await browser.newPage();
const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
async function render(svg, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${dataUri(svg)}" style="display:block;width:${w}px;height:${h}px;object-fit:contain"></body></html>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.screenshot({ path: file, omitBackground: true });
}
const SIZES = [1024, 512, 192, 180, 48, 32];
for (const name of ['logo', 'logo-mono', 'logo-reverse', 'app-icon', 'app-icon-square']) {
  for (const s of SIZES) await render(files[`${name}.svg`], s, s, path.join(PNG, `${name}-${s}.png`));
}
for (const w of [1024, 512]) {
  await render(wordmark, w, Math.round((w * WM_H) / WM_W), path.join(PNG, `wordmark-${w}.png`));
  await render(wordmarkReverse, w, Math.round((w * WM_H) / WM_W), path.join(PNG, `wordmark-reverse-${w}.png`));
}

const img = (svg, px, extra = '') => `<img src="${dataUri(svg)}" width="${px}" height="${px}" style="display:block;${extra}">`;
const SHEET_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const etsyCard = (svg) =>
  `<div class="etsy-mock"><div class="circle" style="width:70px;height:70px">${img(svg, 70)}</div><div><b>WhereItAllIs</b><span>Calm budget planners</span></div></div>`;
const sheet = `<!doctype html><html><head><style>
  body { margin:0; background:#ECE8DF; font: 15px/1.4 ${SHEET_FONT}; color:${NAVY}; }
  .sheet { width: 1400px; padding: 40px; box-sizing: border-box; display:grid; gap: 28px; }
  h1 { margin:0; font-size: 26px; font-weight: 600; }
  .row { display:grid; gap: 28px; grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
  .panel { border-radius: 18px; padding: 28px; display:flex; flex-direction:column; gap: 18px; }
  .cream { background:${CREAM}; } .navy { background:${NAVY}; color:${CREAM}; } .white { background:#fff; }
  .lbl { margin:0; font-size: 13px; font-weight:600; letter-spacing:.04em; text-transform: uppercase; opacity:.7; }
  .marks, .icons { display:flex; align-items:flex-end; gap: 36px; }
  .cap { margin: 8px 0 0; font-size: 13px; opacity:.7; text-align:center; }
  .circle { border-radius: 50%; overflow:hidden; }
  .etsy { display:flex; align-items:center; gap: 40px; }
  .etsy-mock { display:flex; align-items:center; gap: 14px; padding: 14px 18px; border:1px solid #ddd; border-radius: 12px; background:#fff; color:#222; font-family: Arial, sans-serif; }
  .etsy-mock b { display:block; font-size: 17px; } .etsy-mock span { font-size: 13px; color:#595959; }
</style></head><body><div class="sheet">
  <h1>${NAME} — brand</h1>
  <div class="row">
    <div class="panel cream"><p class="lbl">Mark on cream</p>
      <div class="marks">${img(logo, 200)}${img(logo, 96)}${img(logo, 48)}${img(logo, 32)}${img(files['logo-mono.svg'], 96)}${img(files['logo-mono.svg'], 32)}</div></div>
    <div class="panel navy"><p class="lbl">Mark on navy</p>
      <div class="marks">${img(files['logo-reverse.svg'], 200)}${img(files['logo-reverse.svg'], 96)}${img(files['logo-reverse.svg'], 48)}${img(files['logo-reverse.svg'], 32)}</div></div>
  </div>
  <div class="row">
    <div class="panel white"><p class="lbl">App icon</p>
      <div class="icons"><div>${img(appIcon, 180)}<p class="cap">180 px</p></div><div>${img(appIcon, 48)}<p class="cap">48 px</p></div><div>${img(appIcon, 32)}<p class="cap">32 px</p></div></div></div>
    <div class="panel cream"><p class="lbl">Wordmark (Inter SemiBold, outlined)</p>
      <img src="${dataUri(wordmark)}" width="440" style="display:block"><img src="${dataUri(wordmark)}" width="220" style="display:block">
      <div style="background:${NAVY};padding:20px;border-radius:12px"><img src="${dataUri(wordmarkReverse)}" width="300" style="display:block"></div></div>
  </div>
  <div class="panel white"><p class="lbl">Etsy shop icon (circle crop, mark 55% of the width)</p>
    <div class="etsy">
      <div><div class="circle" style="width:500px;height:500px">${img(appIconSquare, 500)}</div><p class="cap">500 px</p></div>
      <div style="display:flex;flex-direction:column;gap:24px">
        <div><div class="circle" style="width:70px;height:70px">${img(appIconSquare, 70)}</div><p class="cap" style="text-align:left">70 px</p></div>
        ${etsyCard(appIconSquare)}
      </div>
    </div>
  </div>
</div></body></html>`;
await page.setViewportSize({ width: 1400, height: 800 });
await page.setContent(sheet);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await page.locator('.sheet').screenshot({ path: path.join(OUT, 'preview.png') });
await browser.close();

console.log(`branding/: ${Object.keys(files).join(', ')}
branding/png/: ${SIZES.join(', ')} px; wordmark 1024/512
src/ui/brandMarks.ts, branding/preview.png
wordmark ${WM_W}×${WM_H}, cap height ${r2(capHeight)}`);
