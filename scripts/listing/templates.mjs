// The 12 listing images as HTML (2400×1800), built from the app's own tokens, fonts and logo.
// Everything that matters sits in the centred 1800×1800 square (marked data-safe; render.mjs checks).
// Screens are shown large: full phones at least 1100 px tall, or the key part of a screen cropped
// into a card, so app text is at least ~28 px on the final image.
import { icon } from './lib.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Shared page: tokens + fonts from the app, one 2400×1800 canvas, the safe square inside it. */
function page(server, { theme, body, css = '' }) {
  const b = server.base;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="${b}/src/tokens.css"><link rel="stylesheet" href="${b}/src/fonts.css">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 2400px; height: 1800px; overflow: hidden; }
  body { font-family: var(--font); -webkit-font-smoothing: antialiased; }
  .canvas { position: relative; width: 2400px; height: 1800px; overflow: hidden; color: var(--ink); }
  .navy { --ink: var(--hero-text); --ink-muted: var(--hero-muted); --pill-bg: rgb(247 243 234 / 10%); --pill-line: rgb(247 243 234 / 22%);
          background: radial-gradient(1400px 1000px at 78% 18%, var(--hero-end), transparent 70%), var(--hero-start); }
  .cream { --ink: var(--text); --ink-muted: var(--text-muted); --pill-bg: var(--surface); --pill-line: var(--border);
           background: radial-gradient(1300px 900px at 80% 10%, var(--surface), transparent 70%), var(--bg); }
  .safe { position: absolute; left: 300px; top: 0; width: 1800px; height: 1800px; padding: 100px 80px 90px;
          display: flex; flex-direction: column; align-items: center; text-align: center; }
  .head { display: flex; flex-direction: column; align-items: center; }
  .main { flex: 1; width: 100%; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  /* Fraunces at display size: open the letters a touch, keep normal word spacing. */
  h1 { font-family: var(--font-display); font-weight: 600; font-size: 122px; line-height: 1.06; letter-spacing: 0.012em; word-spacing: normal;
       font-optical-sizing: auto; max-width: 1640px; text-wrap: balance; }
  .sub { margin-top: 26px; font-size: 46px; line-height: 1.3; color: var(--ink-muted); max-width: 1560px; text-wrap: balance; }
  .row { display: flex; justify-content: center; align-items: flex-start; width: 100%; }
  .col { display: flex; flex-direction: column; align-items: center; }
  .cap { font-size: 40px; font-weight: 600; margin-bottom: 22px; color: var(--ink); }
  .phone { background: #0E1526; border-radius: 80px; padding: 20px; box-shadow: var(--shadow-2); }
  .phone img { display: block; width: 100%; border-radius: 62px; }
  /* A piece cut out of the app (already a card): just shadow and rounding. */
  .shot { border-radius: 40px; overflow: hidden; box-shadow: var(--shadow-2); background: var(--surface); }
  .shot img { display: block; width: 100%; }
  /* A piece without its own card: set in one. */
  .framed { border-radius: 44px; background: var(--surface); box-shadow: var(--shadow-2); padding: 40px; text-align: left; }
  .framed img { display: block; width: 100%; }
  .framed h2 { font-size: 46px; font-weight: 700; color: var(--text); margin: 4px 4px 26px; }
  .fade { -webkit-mask-image: linear-gradient(#000 86%, transparent); }
  .pill { display: inline-flex; align-items: center; gap: 18px; padding: 20px 34px; border-radius: 999px; font-size: 40px; font-weight: 600;
          background: var(--pill-bg); border: 2px solid var(--pill-line); color: var(--ink); white-space: nowrap; }
  .pill svg { color: var(--accent); flex: none; }
  .cream .pill svg { color: var(--link); }
  .tick { display: inline-flex; width: 66px; height: 66px; border-radius: 50%; align-items: center; justify-content: center; flex: none;
          background: var(--accent); color: var(--hero-start); }
  ${css}
</style></head><body><div class="canvas ${theme}"><div class="safe">${body}${body.includes('class="main"') ? '</div>' : ''}</div></div></body></html>`;
}

const url = (server, name) => `${server.base}/listing/.build/${name}.png`;
const phone = (server, name, width, label = name) =>
  `<div class="phone" data-safe="${label}" style="width:${width}px"><img src="${url(server, name)}" alt=""></div>`;
/** A cut-out card. height crops it from the top (with a fade). */
const cut = (server, name, width, { height, fade = !!height, label = name, cls = '' } = {}) =>
  `<div class="shot${fade ? ' fade' : ''} ${cls}" data-safe="${label}" style="width:${width}px;${height ? `height:${height}px;` : ''}"><img src="${url(server, name)}" alt=""></div>`;
const framed = (server, name, width, { title = '', height, label = name, cls = '' } = {}) =>
  `<div class="framed${height ? ' fade' : ''} ${cls}" data-safe="${label}" style="width:${width}px;${height ? `height:${height}px;overflow:hidden;` : ''}">${title ? `<h2>${esc(title)}</h2>` : ''}<img src="${url(server, name)}" alt=""></div>`;
const head = (s) =>
  `<header class="head"><h1 data-safe="headline">${esc(s.headline)}</h1>${s.sub ? `<p class="sub" data-safe="sub">${esc(s.sub)}</p>` : ''}</header><div class="main">`;
const tick = () => `<span class="tick">${icon('check', 40, 2.5)}</span>`;

export const templates = [
  // 1 — Stop typing every purchase. (navy) The same Today screen on laptop, tablet and phone, large.
  (s, server) => {
    const b = server.base;
    return page(server, {
      theme: 'navy',
      css: `
        .safe { padding-top: 80px; padding-bottom: 70px; }
        .logo { height: 56px; margin-bottom: 40px; }
        .chips { display: flex; gap: 22px; margin-top: 36px; }
        .main { justify-content: flex-end; }
        .devices { position: relative; width: 1540px; height: 1010px; }
        .laptop { position: absolute; left: 150px; top: 0; width: 1240px; }
        .laptop .lid { background: #0E1526; border-radius: 34px 34px 0 0; padding: 22px 22px 26px; box-shadow: var(--shadow-2); }
        .laptop .lid img { display: block; width: 100%; border-radius: 10px; }
        .laptop .base { height: 36px; margin: 0 -70px; background: linear-gradient(#C9CDD6, #8F96A6); border-radius: 0 0 40px 40px; }
        .tablet { position: absolute; left: 0; bottom: 0; width: 540px; background: #0E1526; border-radius: 48px; padding: 18px; box-shadow: var(--shadow-2); }
        .tablet img { display: block; width: 100%; border-radius: 32px; }
        .devices .phone { position: absolute; right: 0; bottom: 0; width: 400px; border-radius: 62px; padding: 16px; }
        .devices .phone img { border-radius: 48px; }`,
      body: `
        <img class="logo" data-safe="logo" src="${b}/branding/wordmark-reverse.svg" alt="Where It All Is">
        ${head(s)}
        <div class="chips" data-safe="chips" style="margin-bottom:auto">${s.chips.map((c) => `<span class="pill">${icon('check', 40, 2.2)}${esc(c)}</span>`).join('')}</div>
        <div class="devices" data-safe="devices">
          <div class="laptop"><div class="lid"><img src="${b}/docs/device-shots/desktop-light.png" alt=""></div><div class="base"></div></div>
          <div class="tablet"><img src="${b}/docs/device-shots/tablet-light.png" alt=""></div>
          <div class="phone"><img src="${b}/docs/device-shots/phone-light.png" alt=""></div>
        </div>`,
    });
  },

  // 2 — One number. (cream) A large phone, and one card with the breakdown's key rows.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `.row { gap: 70px; align-items: center; margin-top: 40px; }`,
      body: `${head(s)}
        <div class="row">
          ${phone(server, 'today', 560)}
          ${framed(server, 'explain-rows', 860, { title: s.captionBreakdown })}
        </div>`,
    }),

  // 3 — Import. (navy) Preview (fading out), review and balance check, with callouts.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        .row { gap: 60px; margin-top: 44px; }
        .side { display: flex; flex-direction: column; gap: 22px; align-items: flex-start; width: 800px; text-align: left; }
        .callout { display: flex; align-items: center; gap: 22px; font-size: 50px; font-weight: 700; line-height: 1.15; }`,
      body: `${head(s)}
        <div class="row">
          ${cut(server, 'import-preview', 780, { height: 1240, label: 'preview' })}
          <div class="side">
            <p class="callout" data-safe="callout-confirm">${tick()}${esc(s.callouts[2])}</p>
            <p class="callout" data-safe="callout-duplicates">${tick()}${esc(s.callouts[0])}</p>
            ${cut(server, 'import-review', 800, { label: 'review' })}
            <p class="callout" data-safe="callout-balance">${tick()}${esc(s.callouts[1])}</p>
            ${cut(server, 'import-balance', 800, { label: 'balance' })}
          </div>
        </div>`,
    }),

  // 4 — Bills and payday. (cream) The bill rows (with their chips) and the calendar, cropped large.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `.row { gap: 60px; margin-top: 40px; } .bills { background: var(--bg); }`,
      body: `${head(s)}
        <div class="row">
          <div class="col"><p class="cap">${esc(s.captionList)}</p>${cut(server, 'bills-rows', 800, { height: 1180, label: 'bill rows', cls: 'bills' })}</div>
          <div class="col"><p class="cap">${esc(s.captionCalendar)}</p>${cut(server, 'bills-calendar', 800, { label: 'calendar', cls: 'bills' })}</div>
        </div>`,
    }),

  // 5 — Quick log. (navy) The chips and the box, large.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `.main { gap: 46px; } .labels { display: flex; gap: 28px; }`,
      body: `${head(s)}
          ${cut(server, 'quick-log', 1320, { label: 'quick-log' })}
          <div class="labels" data-safe="labels">
            <span class="pill">${icon('mouse-pointer-click', 44)}${esc(s.captionChips)}</span>
            <span class="pill">${icon('keyboard', 44)}${esc(s.captionBox)}</span>
          </div>`,
    }),

  // 6 — Plan. (cream) Three large cropped cards: envelopes, a goal ring, the debt-free date.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `
        .row { gap: 40px; margin-top: 36px; }
        .stack { display: flex; flex-direction: column; gap: 20px; align-items: flex-start; }
        .cap { margin-bottom: 0; text-align: left; }
        .framed { padding: 30px 36px; }
        .debt { border-radius: 40px; overflow: hidden; box-shadow: var(--shadow-2); }
        .debt img { display: block; width: 100%; }`,
      body: `${head(s)}
        <div class="row">
          <div class="stack"><p class="cap">${esc(s.captionEnvelopes)}</p>${cut(server, 'plan-envelopes', 860, { label: 'envelopes' })}</div>
          <div class="stack">
            <p class="cap">${esc(s.captionGoals)}</p>${framed(server, 'plan-goal', 740, { label: 'goal' })}
            <p class="cap" style="margin-top:10px">${esc(s.captionDebt)}</p>
            <div class="debt" data-safe="debt" style="width:740px"><img src="${url(server, 'plan-debt')}" alt=""></div>
          </div>
        </div>`,
    }),

  // 7 — Insights. (navy) Donut and six-month flow, large.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `.row { gap: 60px; align-items: center; margin-top: 30px; }`,
      body: `${head(s)}
        <div class="row">
          <div class="col"><p class="cap">${esc(s.captionDonut)}</p>${cut(server, 'insights-donut', 790, { label: 'donut' })}</div>
          <div class="col"><p class="cap">${esc(s.captionFlow)}</p>${cut(server, 'insights-flow', 790, { label: 'flow' })}</div>
        </div>`,
    }),

  // 8 — Welcome back. (cream) The three steps, large enough to read.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `
        .row { gap: 25px; margin-top: 40px; }
        .col { width: 530px; }
        .num { width: 66px; height: 66px; border-radius: 50%; background: var(--hero-start); color: var(--hero-text); font-size: 36px; font-weight: 700;
               display: flex; align-items: center; justify-content: center; margin-bottom: 14px; }
        .cap { font-size: 36px; line-height: 1.2; margin-bottom: 20px; white-space: nowrap; }`,
      body: `${head(s)}
        <div class="row">
          ${['away-1', 'away-2', 'away-3']
            .map((n, i) => `<div class="col"><span class="num" data-safe="step-${i + 1}">${i + 1}</span><p class="cap">${esc(s.steps[i])}</p>${cut(server, n, 530, { label: n })}</div>`)
            .join('')}
        </div>`,
    }),

  // 9 — Private by design. (navy) Icons only, large tiles.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; width: 1640px; }
        .tile { display: flex; flex-direction: column; gap: 34px; align-items: flex-start; text-align: left; padding: 64px 60px; border-radius: 48px; min-height: 540px;
                background: rgb(247 243 234 / 7%); border: 2px solid rgb(247 243 234 / 14%); }
        .ic { width: 180px; height: 180px; border-radius: 50px; background: var(--accent); color: var(--hero-start); flex: none;
              display: flex; align-items: center; justify-content: center; }
        .tile h2 { font-size: 68px; line-height: 1.08; margin-bottom: 16px; }
        .tile p { font-size: 46px; line-height: 1.3; color: var(--ink-muted); }`,
      body: `${head(s)}
        <div class="grid">
          ${s.points.map((p) => `<div class="tile" data-safe="${esc(p.title)}"><span class="ic">${icon(p.icon, 104, 1.9)}</span><div><h2>${esc(p.title)}</h2><p>${esc(p.text)}</p></div></div>`).join('')}
        </div>`,
    }),

  // 10 — Budget together. (cream) The locked share and the partner's read-only view, cropped large.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `
        .row { gap: 0; margin-top: 40px; align-items: center; }
        .arrow { width: 120px; display: flex; flex-direction: column; align-items: center; gap: 14px; color: var(--text); }
        .arrow .ic { width: 104px; height: 104px; border-radius: 50%; background: var(--hero-start); color: var(--accent);
                     display: flex; align-items: center; justify-content: center; }
        .view { padding: 0; }`,
      body: `${head(s)}
        <div class="row">
          <div class="col"><p class="cap">${esc(s.captionShare)}</p>${cut(server, 'partner-share', 760, { label: 'share' })}</div>
          <div class="arrow" data-safe="lock"><span class="ic">${icon('file-lock', 58, 1.9)}</span>${icon('arrow-right', 64, 2.2)}</div>
          <div class="col"><p class="cap">${esc(s.captionView)}</p>${framed(server, 'partner-view', 760, { height: 1015, label: 'partner view', cls: 'view' })}</div>
        </div>`,
    }),

  // 11 — Works on everything. (navy) Compatibility table, large.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        table { width: 1640px; border-collapse: separate; border-spacing: 0; font-size: 66px; text-align: left;
                background: rgb(247 243 234 / 7%); border: 2px solid rgb(247 243 234 / 16%); border-radius: 48px; overflow: hidden; }
        th, td { padding: 58px 70px; }
        thead th { font-size: 42px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted); font-weight: 600; padding-bottom: 30px; }
        tbody tr + tr td { border-top: 2px solid rgb(247 243 234 / 14%); }
        td:first-child { font-weight: 700; }
        td.ok { width: 140px; }
        td .tick { width: 80px; height: 80px; }
        .notes { display: flex; gap: 28px; margin-top: 70px; }
        .notes .pill { font-size: 46px; padding: 24px 40px; }`,
      body: `${head(s)}
        <table data-safe="table">
          <thead><tr><th>Device</th><th>Browser</th><th></th></tr></thead>
          <tbody>${s.rows.map(([d, br]) => `<tr><td>${esc(d)}</td><td>${esc(br)}</td><td class="ok"><span class="tick">${icon('check', 48, 2.5)}</span></td></tr>`).join('')}</tbody>
        </table>
        <div class="notes" data-safe="notes">
          <span class="pill">${icon('wifi', 50)}${esc(s.notes[0])}</span>
          <span class="pill">${icon('circle-check', 50)}${esc(s.notes[1])}</span>
        </div>`,
    }),

  // 12 — What you get. (cream) Contents, the download note, the demo; a larger, tilted PDF preview.
  (s, server) => {
    const b = server.base;
    return page(server, {
      theme: 'cream',
      css: `
        .badge { margin-top: 34px; padding: 22px 44px; border-radius: 999px; background: var(--hero-start); color: var(--hero-text);
                 font-size: 42px; font-weight: 700; letter-spacing: 0.02em; }
        .row { gap: 50px; align-items: center; }
        .items { display: flex; flex-direction: column; gap: 28px; width: 960px; }
        .item { display: flex; gap: 36px; align-items: center; text-align: left; padding: 38px 44px; border-radius: 40px; background: var(--surface);
                box-shadow: var(--shadow-1); border: 2px solid var(--border); }
        .ic { width: 124px; height: 124px; border-radius: 34px; background: var(--hero-start); color: var(--accent); flex: none;
              display: flex; align-items: center; justify-content: center; }
        .item h2 { font-size: 52px; margin-bottom: 8px; }
        .item p { font-size: 38px; line-height: 1.32; color: var(--text-muted); }
        .visual { position: relative; width: 630px; height: 880px; }
        .pdf { position: absolute; right: 16px; top: 16px; width: 570px; border-radius: 18px; box-shadow: var(--shadow-2); transform: rotate(4deg); }
        .appicon { position: absolute; left: 0; bottom: 0; width: 220px; border-radius: 50px; box-shadow: var(--shadow-2); }
        .notes { margin-top: 44px; display: flex; flex-direction: column; gap: 20px; align-items: center; }
        .notes .pill { font-size: 42px; }`,
      body: `${head(s)}
        <p class="badge" data-safe="badge">${esc(s.badge)}</p>
        <div class="row" style="margin-top:40px">
          <div class="items">${s.items.map((it) => `<div class="item" data-safe="${esc(it.title)}"><span class="ic">${icon(it.icon, 76, 1.9)}</span><div><h2>${esc(it.title)}</h2><p>${esc(it.text)}</p></div></div>`).join('')}</div>
          <div class="visual" data-safe="visual">
            <img class="pdf" src="${b}/screenshots/phase6/start-here-Letter-page-1.png" alt="">
            <img class="appicon" src="${b}/branding/png/app-icon-512.png" alt="">
          </div>
        </div>
        <div class="notes" data-safe="notes">
          <span class="pill">${icon('globe', 44)}${esc(s.notes[0])}</span>
          <span class="pill">${icon('play', 44)}${esc(s.notes[1])}</span>
        </div>`,
    });
  },
];

/** All twelve, small, on one sheet. */
export function contactSheet(images, server) {
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${server.base}/src/fonts.css"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1920px; height: 1200px; background: #E9E4D8; font-family: Inter, sans-serif; padding: 40px 48px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 26px 28px; }
    figure img { display: block; width: 100%; aspect-ratio: 4 / 3; border-radius: 10px; box-shadow: 0 4px 14px rgb(31 42 68 / 18%); }
    figcaption { font-size: 15px; color: #1F2A44; margin-top: 8px; font-weight: 600; }
  </style></head><body><div class="grid">${images
    .map((im, i) => `<figure><img src="${server.base}/listing/${im.file}?v=${Date.now()}"><figcaption>${i + 1}. ${esc(im.headline)}</figcaption></figure>`)
    .join('')}</div></body></html>`;
}
