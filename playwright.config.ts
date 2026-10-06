import { defineConfig, devices } from '@playwright/test';

// E2E runs against the built single file over file://, exactly as customers open it.
// Uses the locally installed Chrome (no browser download). WebKit is added in Phase 7.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1, // one browser at a time: parallel runs on a busy machine time out in setup, not in the app
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
});
