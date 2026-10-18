// Electrix USA staging tests. Runs against the live staging site + Supabase over real HTTPS.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,          // security ordering matters; keep it simple and serial
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'results.json' }]],
  use: {
    baseURL: process.env.STAGING_URL || 'https://baruchw27.github.io/ElectrixUSA/staging/',
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
});
