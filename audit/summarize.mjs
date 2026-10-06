// Summarise screenshots/phase2/*/report.json: node audit/summarize.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('screenshots/phase2');
const reports = fs
  .readdirSync(root)
  .filter((d) => fs.existsSync(path.join(root, d, 'report.json')))
  .map((d) => JSON.parse(fs.readFileSync(path.join(root, d, 'report.json'), 'utf8')));

const uniq = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];

for (const r of reports) {
  console.log(`\n=== ${r.project} (body bg ${r.bodyBackground}) ===`);
  console.log(`onboarding: ${r.afterOnboarding.taps} taps, ${r.afterOnboarding.fields} fields | incl. Netflix: ${r.setupTotal.taps} taps, ${r.setupTotal.fields} fields | usage: ${r.usage.taps} taps, ${r.usage.fields} fields`);
  console.log(`console: ${r.consoleErrors.length ? r.consoleErrors.join(' | ') : 'none'} | network: ${r.network.length ? r.network.join(', ') : 'none'}`);
  const all = (k) => r.steps.flatMap((s) => s.findings[k].map((f) => ({ ...f, step: s.step })));
  const hs = r.steps.filter((s) => s.findings.horizontalScroll).map((s) => s.step);
  console.log(`horizontal scroll: ${hs.length ? hs.join(', ') : 'none'}`);
  console.log('small text:');
  for (const f of uniq(all('smallText'), (f) => `${f.where}|${f.px}`)) console.log(`  ${f.px}px  ${f.where}  "${f.text}"  (first at ${f.step})`);
  console.log('small targets:');
  for (const f of uniq(all('smallTargets'), (f) => `${f.label.replace(/\d+/g, '#')}|${f.w}x${f.h}`)) console.log(`  ${f.w}x${f.h}  "${f.label}"  (first at ${f.step})`);
  console.log('clipped:');
  for (const f of uniq(all('clipped'), (f) => `${f.text}|${f.why}`)) console.log(`  "${f.text}" ${f.why}  (${f.step})`);
  console.log('overlaps:');
  for (const f of uniq(all('overlaps'), (f) => `${f.a}|${f.b}`)) console.log(`  "${f.a}" × "${f.b}"  (${f.step})`);
}
