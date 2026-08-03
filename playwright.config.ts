import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:19006',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
