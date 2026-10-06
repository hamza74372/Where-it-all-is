import { defineConfig, devices } from '@playwright/test';

// Device/engine/theme audit of the built dist/app.html (run: npm run audit).
// iPhone 13 → WebKit (Safari's engine), Pixel 7 → Chromium, each in light and dark.
export default defineConfig({
  testDir: 'audit',
  testMatch: '*.audit.ts',
  timeout: 120_000,
  reporter: 'list',
  workers: 1,
  projects: [
    { name: 'webkit-iphone13-light', use: { ...devices['iPhone 13'], colorScheme: 'light' } },
    { name: 'webkit-iphone13-dark', use: { ...devices['iPhone 13'], colorScheme: 'dark' } },
    { name: 'chromium-pixel7-light', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'chromium-pixel7-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
  ],
});
