// UI smoke test against the live staging website. Confirms the app loads, sign-in by name works, the STAGING banner
// is present, and sign-out returns to the sign-in screen with no leftover data. Selectors come from the staging
// index.html (#lgUser, #lgPass, #lgErr). If the UI changes, adjust the selectors; failures here are UI/selector issues,
// not necessarily security problems.
const { test, expect } = require('@playwright/test');
const { cfg } = require('./_helpers');
const C = cfg();
const A = C.accounts.workerA;

test('app loads and shows the STAGING banner', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toContainText('STAGING', { timeout: 20000 });
  await page.screenshot({ path: 'shots/01-load.png', fullPage: true });
});

test('wrong password shows a neutral error (no "no such user")', async ({ page }) => {
  await page.goto('./');
  await page.fill('#lgUser', A.firstName || A.email);
  await page.fill('#lgPass', 'wrong-password-123');
  await page.click('#m-login button.btn:not(.sec2)');
  await expect(page.locator('#lgErr')).toBeVisible();
  const msg = (await page.locator('#lgErr').textContent()) || '';
  expect(/no one|not found|unknown/i.test(msg), 'error must not reveal whether the name exists').toBeFalsy();
  await page.screenshot({ path: 'shots/02-badpass.png' });
});

test('sign in by first name, then sign out leaves no data behind', async ({ page }) => {
  await page.goto('./');
  await page.fill('#lgUser', A.firstName || A.email);
  await page.fill('#lgPass', A.password);
  await page.click('#m-login button.btn:not(.sec2)');
  // wait for the app to leave the login screen
  await expect(page.locator('#m-login')).toBeHidden({ timeout: 30000 });
  await page.screenshot({ path: 'shots/03-signed-in.png', fullPage: true });
  // the data cache should now exist for this account
  const hasData = await page.evaluate(() => !!localStorage.getItem('stg__electrix_v29'));
  expect(hasData, 'app data cached after sign-in').toBeTruthy();
  // NOTE: the clock-in / receipt-upload steps need the live UI; drive them here once the on-screen controls are confirmed.
  // Sign out via the app, then verify the data cache is cleared.
  await page.evaluate(() => window.EX_logout && window.EX_logout());
  await page.waitForTimeout(1500);
  const cleared = await page.evaluate(() => !localStorage.getItem('stg__electrix_v29') && !localStorage.getItem('stg__electrix_bio'));
  expect(cleared, 'data + biometric cleared after logout').toBeTruthy();
  await page.screenshot({ path: 'shots/04-signed-out.png', fullPage: true });
});
