// Proves the audit can actually find problems: plant one of each, expect each to be reported.
import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPage } from './checks';

test('audit self-test: planted problems are all detected', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium-pixel7-light', 'one project is enough');
  await page.goto(pathToFileURL(path.resolve('dist/app.html')).href);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.locator('.big-number').waitFor(); // let the app finish rendering first
  await page.evaluate(() => {
    // Our own container: the app never re-renders it, so the planted problems can't be wiped.
    const m = document.body.appendChild(document.createElement('div'));
    m.insertAdjacentHTML(
      'afterbegin',
      `<p style="font-size:11px">tiny text</p>
       <p style="color:#dddddd">faint text</p>
       <button style="width:30px;height:30px">x</button>
       <p style="white-space:nowrap;overflow:hidden;width:40px">clipped text that is long</p>`,
    );
  });
  const f = await page.evaluate(auditPage);
  expect(f.smallText.map((x) => x.text)).toContain('tiny text');
  expect(f.lowContrast.map((x) => x.text)).toContain('faint text');
  expect(f.smallTargets.map((x) => x.label)).toContain('x');
  expect(f.clipped.map((x) => x.text)).toContain('clipped text that is long');
});
