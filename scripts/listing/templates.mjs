// The 12 listing images as HTML (2400×1800), built from the app's own tokens, fonts and logo.
// Everything that matters sits in the centred 1800×1800 square (marked data-safe; render.mjs checks).
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
  body { font-family: var(--font); color: var(--ink); -webkit-font-smoothing: antialiased; }
  .canvas { position: relative; width: 2400px; height: 1800px; overflow: hidden; color: var(--ink); }
  .navy { --ink: var(--hero-text); --ink-muted: var(--hero-muted); --pill-bg: rgb(247 243 234 / 10%); --pill-line: rgb(247 243 234 / 22%);
          background: radial-gradient(1400px 1000px at 78% 18%, var(--hero-end), transparent 70%), var(--hero-start); }
  .cream { --ink: var(--text); --ink-muted: var(--text-muted); --pill-bg: var(--surface); --pill-line: var(--border);
           background: radial-gradient(1300px 900px at 80% 10%, var(--surface), transparent 70%), var(--bg); }
  .safe { position: absolute; left: 300px; top: 0; width: 1800px; height: 1800px; padding: 120px 80px 110px;
          display: flex; flex-direction: column; align-items: center; text-align: center; }
  h1 { font-family: var(--font-display); font-weight: 640; font-size: 124px; line-height: 1.04; letter-spacing: -0.015em; max-width: 1640px; }
  .sub { margin-top: 34px; font-size: 50px; line-height: 1.3; color: var(--ink-muted); max-width: 1480px; }
  .row { display: flex; gap: 56px; align-items: flex-start; justify-content: center; }
  .head { display: flex; flex-direction: column; align-items: center; }
  .main { flex: 1; width: 100%; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .grow { display: flex; align-items: center; justify-content: center; width: 100%; }
  .cap { font-size: 40px; font-weight: 600; margin-bottom: 26px; color: var(--ink); }
  /* A phone: dark bezel round the real screenshot. */
  .phone { background: #0E1526; border-radius: 76px; padding: 20px; box-shadow: var(--shadow-2); }
  .phone img { display: block; width: 100%; border-radius: 58px; }
  /* A card cut out of the app, floating. */
  .shot { border-radius: 40px; overflow: hidden; box-shadow: var(--shadow-2); background: var(--surface); }
  .shot img { display: block; width: 100%; }
  .pill { display: inline-flex; align-items: center; gap: 18px; padding: 20px 34px; border-radius: 999px; font-size: 40px; font-weight: 600;
          background: var(--pill-bg); border: 2px solid var(--pill-line); color: var(--ink); white-space: nowrap; }
  .pill svg { color: var(--accent); flex: none; }
  .cream .pill svg { color: var(--link); }
  .tick { display: inline-flex; width: 64px; height: 64px; border-radius: 50%; align-items: center; justify-content: center; flex: none;
          background: var(--accent); color: var(--hero-start); }
  ${css}
</style></head><body><div class="canvas ${theme}"><div class="safe">${body}${body.includes('class="main"') ? '</div>' : ''}</div></div></body></html>`;
}

const shotUrl = (server, name) => `${server.base}/listing/.build/${name}.png`;
const phone = (server, name, width, label = name) =>
  `<div class="phone" data-safe="${label}" style="width:${width}px"><img src="${shotUrl(server, name)}" alt=""></div>`;
const cut = (server, name, width, label = name, extra = '') =>
  `<div class="shot" data-safe="${label}" style="width:${width}px;${extra}"><img src="${shotUrl(server, name)}" alt=""></div>`;
const head = (s) => `<header class="head"><h1 data-safe="headline">${esc(s.headline)}</h1>${s.sub ? `<p class="sub" data-safe="sub">${esc(s.sub)}</p>` : ''}</header><div class="main">`;

export const templates = [
  // 1 — Stop typing every purchase. (navy) The same Today screen on laptop, tablet and phone.
  (s, server) => {
    const b = server.base;
    return page(server, {
      theme: 'navy',
      css: `
        .logo { height: 70px; margin-bottom: 64px; }
        .devices { position: relative; width: 1640px; height: 940px; margin-top: auto; }
        .laptop { position: absolute; left: 190px; top: 0; width: 1270px; }
        .laptop .lid { background: #0E1526; border-radius: 34px 34px 0 0; padding: 22px 22px 26px; box-shadow: var(--shadow-2); }
        .laptop .lid img { display: block; width: 100%; border-radius: 10px; }
        .laptop .base { height: 34px; margin: 0 -70px; background: linear-gradient(#C9CDD6, #8F96A6); border-radius: 0 0 40px 40px; }
        .tablet { position: absolute; left: 0; bottom: 0; width: 520px; background: #0E1526; border-radius: 46px; padding: 18px; box-shadow: var(--shadow-2); }
        .tablet img { display: block; width: 100%; border-radius: 30px; }
        .devices .phone { position: absolute; right: 30px; bottom: 0; }
        .chips { display: flex; gap: 24px; margin-top: 48px; }
        .main { justify-content: space-between; }`,
      body: `
        <img class="logo" data-safe="logo" src="${b}/branding/wordmark-reverse.svg" alt="Where It All Is">
        ${head(s)}
        <div class="chips" data-safe="chips">${s.chips.map((c) => `<span class="pill">${icon('check', 40, 2.2)}${esc(c)}</span>`).join('')}</div>
        <div class="devices" data-safe="devices">
          <div class="laptop"><div class="lid"><img src="${b}/docs/device-shots/desktop-light.png" alt=""></div><div class="base"></div></div>
          <div class="tablet"><img src="${b}/docs/device-shots/tablet-light.png" alt=""></div>
          <div class="phone" style="width:330px;border-radius:56px;padding:15px"><img style="border-radius:40px" src="${b}/docs/device-shots/phone-light.png" alt=""></div>
        </div>`,
    });
  },

  // 2 — One number. (cream) Phone hero plus the breakdown.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `.grow { gap: 90px; align-items: flex-start; margin-top: 70px; } .col { display: flex; flex-direction: column; align-items: center; }`,
      body: `${head(s)}
        <div class="grow">
          <div class="col"><p class="cap">${esc(s.captionHero)}</p>${phone(server, 'today', 520)}</div>
          <div class="col"><p class="cap">${esc(s.captionBreakdown)}</p>${cut(server, 'explain', 600, 'explain', 'max-height:1090px;-webkit-mask-image:linear-gradient(#000 84%, transparent)')}</div>
        </div>`,
    }),

  // 3 — Import. (navy) Preview, review and balance check, with callouts.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        .grow { gap: 80px; align-items: flex-start; margin-top: 70px; }
        .preview { height: 1130px; -webkit-mask-image: linear-gradient(#000 82%, transparent); }
        .side { display: flex; flex-direction: column; gap: 34px; align-items: flex-start; width: 760px; text-align: left; }
        .callout { display: flex; align-items: center; gap: 22px; font-size: 46px; font-weight: 700; }`,
      body: `${head(s)}
        <div class="grow">
          ${cut(server, 'import-preview', 640, 'preview', 'height:1130px').replace('class="shot"', 'class="shot preview"')}
          <div class="side">
            <p class="callout" data-safe="callout-confirm"><span class="tick">${icon('check', 40, 2.5)}</span>${esc(s.callouts[2])}</p>
            <p class="callout" data-safe="callout-duplicates"><span class="tick">${icon('check', 40, 2.5)}</span>${esc(s.callouts[0])}</p>
            ${cut(server, 'import-review', 760, 'review')}
            <p class="callout" data-safe="callout-balance"><span class="tick">${icon('check', 40, 2.5)}</span>${esc(s.callouts[1])}</p>
            ${cut(server, 'import-balance', 760, 'balance')}
          </div>
        </div>`,
    }),

  // 4 — Bills and payday. (cream) List and calendar.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `.grow { gap: 100px; align-items: flex-start; margin-top: 64px; } .col { display: flex; flex-direction: column; align-items: center; }`,
      body: `${head(s)}
        <div class="grow">
          <div class="col"><p class="cap">${esc(s.captionList)}</p>${phone(server, 'bills-list', 560)}</div>
          <div class="col"><p class="cap">${esc(s.captionCalendar)}</p>${phone(server, 'bills-calendar', 560)}</div>
        </div>`,
    }),

  // 5 — Quick log. (navy) The chips and the box, large.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        .grow { flex-direction: column; gap: 46px; }
        .labels { display: flex; gap: 28px; }`,
      body: `${head(s)}
        <div class="grow">
          ${cut(server, 'quick-log', 1320, 'quick-log')}
          <div class="labels" data-safe="labels">
            <span class="pill">${icon('mouse-pointer-click', 44)}${esc(s.captionChips)}</span>
            <span class="pill">${icon('keyboard', 44)}${esc(s.captionBox)}</span>
          </div>
        </div>`,
    }),

  // 6 — Plan. (cream) Envelopes, goals, debt-free date.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `.grow { gap: 60px; align-items: flex-start; margin-top: 80px; } .col { display: flex; flex-direction: column; align-items: center; }`,
      body: `${head(s)}
        <div class="grow">
          <div class="col"><p class="cap">${esc(s.captionEnvelopes)}</p>${phone(server, 'plan-envelopes', 470)}</div>
          <div class="col"><p class="cap">${esc(s.captionGoals)}</p>${phone(server, 'plan-goals', 470)}</div>
          <div class="col"><p class="cap">${esc(s.captionDebt)}</p>${phone(server, 'plan-debt', 470)}</div>
        </div>`,
    }),

  // 7 — Insights. (navy) Donut and six-month flow.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `.grow { gap: 70px; align-items: center; margin-top: 40px; } .col { display: flex; flex-direction: column; align-items: center; }`,
      body: `${head(s)}
        <div class="grow">
          <div class="col"><p class="cap">${esc(s.captionDonut)}</p>${cut(server, 'insights-donut', 760, 'donut')}</div>
          <div class="col"><p class="cap">${esc(s.captionFlow)}</p>${cut(server, 'insights-flow', 760, 'flow')}</div>
        </div>`,
    }),

  // 8 — Welcome back. (cream) The three steps.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `
        .grow { gap: 44px; align-items: flex-start; margin-top: 70px; }
        .col { display: flex; flex-direction: column; align-items: center; width: 520px; }
        .num { width: 76px; height: 76px; border-radius: 50%; background: var(--hero-start); color: var(--hero-text); font-size: 40px; font-weight: 700;
               display: flex; align-items: center; justify-content: center; margin-bottom: 18px; }
        .cap { min-height: 104px; font-size: 38px; line-height: 1.3; }`,
      body: `${head(s)}
        <div class="grow">
          ${['away-1', 'away-2', 'away-3']
            .map((n, i) => `<div class="col"><span class="num" data-safe="step-${i + 1}">${i + 1}</span><p class="cap">${esc(s.steps[i])}</p>${cut(server, n, 520, n)}</div>`)
            .join('')}
        </div>`,
    }),

  // 9 — Private by design. (navy) Icons only.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 54px; width: 1640px; }
        .tile { display: flex; gap: 44px; align-items: flex-start; text-align: left; padding: 66px 60px; border-radius: 44px;
                background: rgb(247 243 234 / 7%); border: 2px solid rgb(247 243 234 / 14%); }
        .ic { width: 168px; height: 168px; border-radius: 44px; background: var(--accent); color: var(--hero-start); flex: none;
              display: flex; align-items: center; justify-content: center; }
        .tile h2 { font-size: 62px; line-height: 1.12; margin-bottom: 16px; }
        .tile p { font-size: 44px; line-height: 1.32; color: var(--ink-muted); }`,
      body: `${head(s)}
        <div class="grid">
          ${s.points.map((p) => `<div class="tile" data-safe="${esc(p.title)}"><span class="ic">${icon(p.icon, 96, 1.9)}</span><div><h2>${esc(p.title)}</h2><p>${esc(p.text)}</p></div></div>`).join('')}
        </div>`,
    }),

  // 10 — Budget together. (cream) Locked share file → read-only view.
  (s, server) =>
    page(server, {
      theme: 'cream',
      css: `
        .grow { gap: 40px; align-items: flex-start; margin-top: 64px; }
        .col { display: flex; flex-direction: column; align-items: center; }
        .arrow { align-self: center; display: flex; flex-direction: column; align-items: center; gap: 18px; color: var(--text); margin-top: 60px; }
        .arrow .ic { width: 170px; height: 170px; border-radius: 50%; background: var(--hero-start); color: var(--accent);
                     display: flex; align-items: center; justify-content: center; }`,
      body: `${head(s)}
        <div class="grow">
          <div class="col"><p class="cap">${esc(s.captionShare)}</p>${phone(server, 'partner-share', 540)}</div>
          <div class="arrow" data-safe="lock"><span class="ic">${icon('file-lock', 92, 1.8)}</span>${icon('arrow-right', 90, 2)}</div>
          <div class="col"><p class="cap">${esc(s.captionView)}</p>${phone(server, 'partner-view', 540)}</div>
        </div>`,
    }),

  // 11 — Works on everything. (navy) Compatibility table.
  (s, server) =>
    page(server, {
      theme: 'navy',
      css: `
        table { width: 1500px; border-collapse: separate; border-spacing: 0; font-size: 56px; text-align: left;
                background: rgb(247 243 234 / 7%); border: 2px solid rgb(247 243 234 / 16%); border-radius: 44px; overflow: hidden; }
        th, td { padding: 46px 60px; }
        thead th { font-size: 38px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-muted); font-weight: 600; padding-bottom: 26px; }
        tbody tr + tr td { border-top: 2px solid rgb(247 243 234 / 14%); }
        td:first-child { font-weight: 700; }
        td.ok { width: 120px; }
        .notes { display: flex; gap: 28px; margin-top: 70px; }`,
      body: `${head(s)}
        <table data-safe="table">
          <thead><tr><th>Device</th><th>Browser</th><th></th></tr></thead>
          <tbody>${s.rows.map(([d, br]) => `<tr><td>${esc(d)}</td><td>${esc(br)}</td><td class="ok"><span class="tick">${icon('check', 40, 2.5)}</span></td></tr>`).join('')}</tbody>
        </table>
        <div class="notes" data-safe="notes">
          <span class="pill">${icon('wifi', 44)}${esc(s.notes[0])}</span>
          <span class="pill">${icon('circle-check', 44)}${esc(s.notes[1])}</span>
        </div>`,
    }),

  // 12 — What you get. (cream) Contents, the download note, the demo.
  (s, server) => {
    const b = server.base;
    return page(server, {
      theme: 'cream',
      css: `
        .badge { margin-top: 40px; padding: 22px 44px; border-radius: 999px; background: var(--hero-start); color: var(--hero-text);
                 font-size: 42px; font-weight: 700; letter-spacing: 0.02em; }
        .grow { gap: 60px; margin-top: 60px; align-items: stretch; }
        .items { display: flex; flex-direction: column; gap: 30px; width: 980px; }
        .item { display: flex; gap: 36px; align-items: center; text-align: left; padding: 38px 44px; border-radius: 40px; background: var(--surface);
                box-shadow: var(--shadow-1); border: 2px solid var(--border); }
        .ic { width: 124px; height: 124px; border-radius: 34px; background: var(--hero-start); color: var(--accent); flex: none;
              display: flex; align-items: center; justify-content: center; }
        .item h2 { font-size: 52px; margin-bottom: 8px; }
        .item p { font-size: 38px; line-height: 1.32; color: var(--text-muted); }
        .visual { position: relative; width: 560px; height: 840px; align-self: center; }
        .pdf { position: absolute; right: 0; top: 0; width: 430px; border-radius: 18px; box-shadow: var(--shadow-2); transform: rotate(3deg); }
        .appicon { position: absolute; left: 0; bottom: 30px; width: 280px; border-radius: 64px; box-shadow: var(--shadow-2); }
        .notes { margin-top: 56px; display: flex; flex-direction: column; gap: 22px; align-items: center; }
        .notes .pill { font-size: 42px; }`,
      body: `${head(s)}
        <p class="badge" data-safe="badge">${esc(s.badge)}</p>
        <div class="grow">
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
