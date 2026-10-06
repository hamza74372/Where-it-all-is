import { defineConfig, devices } from '@playwright/test';

// E2E runs against the built single file over file://, exactly as customers open it.
// Uses the locally installed Chrome (no browser download). WebKit is added in Phase 7.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  reporter: 'list',
  use: {
    ...devices['Pixel 7'],
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
});
