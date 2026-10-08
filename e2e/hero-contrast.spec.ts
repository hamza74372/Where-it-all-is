import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = pathToFileURL(path.resolve('dist/app.html')).href;

function rgb(colour: string): number[] {
  if (colour.startsWith('#')) return [1, 3, 5].map((index) => parseInt(colour.slice(index, index + 2), 16));
  return (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
}

function luminance([red, green, blue]: number[]): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first: string, second: string): number {
  const a = luminance(rgb(first));
  const b = luminance(rgb(second));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('hero number finishes fully opaque with AA contrast across its gradient', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 13, 10, 0) });
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try with example numbers' }).click();
  await page.locator('.big-number').waitFor();
  await page.waitForTimeout(300);
  const style = await page.locator('.big-number').evaluate((element) => {
    const root = getComputedStyle(document.documentElement);
    const button = element.closest('.hero-number');
    return {
      colour: getComputedStyle(element).color,
      opacity: button ? Number(getComputedStyle(button).opacity) : 0,
      start: root.getPropertyValue('--hero-start').trim(),
      end: root.getPropertyValue('--hero-end').trim(),
    };
  });
  expect(style.opacity).toBe(1);
  expect(contrast(style.colour, style.start)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(style.colour, style.end)).toBeGreaterThanOrEqual(4.5);
  const ringValue = Number(await page.locator('.hero .progress-ring').getAttribute('aria-valuenow'));
  expect(ringValue).toBeGreaterThan(0);
  expect(ringValue).toBeLessThan(100);
});
