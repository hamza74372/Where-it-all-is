import { defineConfig, devices } from '@playwright/test';

// E2E runs against the built single file over file://, exactly as customers open it — in
// Chromium (Android, via the installed Chrome) and WebKit (iPhone Safari's engine).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1, // one browser at a time: parallel runs on a busy machine time out in setup, not in the app
  reporter: 'list',
  use: { screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
});
