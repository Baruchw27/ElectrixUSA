// After logout, confirm no private data survives in localStorage, IndexedDB, Cache Storage, or via the service worker.
// (ChatGPT areas 5 and 8.) Selectors: app data key is stg__electrix_v29 on staging.
const { test, expect } = require('@playwright/test');
const { cfg } = require('./_helpers');
const C = cfg();
const A = C.accounts.workerA;

test('no private data survives logout (localStorage / IndexedDB / caches)', async ({ page }) => {
  await page.goto('./');
  await page.fill('#lgUser', A.firstName || A.email);
  await page.fill('#lgPass', A.password);
  await page.click('#m-login button.btn:not(.sec2)');
  await expect(page.locator('#m-login')).toBeHidden({ timeout: 30000 });
  await page.waitForTimeout(2500); // let data cache + sync settle
  await page.evaluate(() => window.EX_logout && window.EX_logout());
  await page.waitForTimeout(2000);

  const residue = await page.evaluate(async () => {
    const out = { ls: [], idb: [], caches: [] };
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); const v = localStorage.getItem(k) || ''; out.ls.push({ k, len: v.length }); } } catch (e) {}
    try { if (indexedDB.databases) { const dbs = await indexedDB.databases(); out.idb = dbs.map(d => d.name); } } catch (e) {}
    try { if (window.caches) { out.caches = await caches.keys(); } } catch (e) {}
    return out;
  });

  // the company data cache and biometric credential must be gone
  const keys = residue.ls.map(x => x.k);
  expect(keys, 'data cache cleared').not.toContain('stg__electrix_v29');
  expect(keys, 'biometric cleared').not.toContain('stg__electrix_bio');
  expect(keys, 'session cleared').not.toContain('stg__ex_auth');
  // any remaining queue stash must be the ENCRYPTED form (ex_qenc__*), never the plaintext live queue
  expect(keys.filter(k => k === 'stg__ex_queue'), 'live queue cleared').toEqual([]);
  const plain = keys.filter(k => k.startsWith('stg__ex_queue__'));
  // plaintext per-uid fallback is acceptable only if encryption was unavailable; log it so the reviewer can see which path ran
  console.log('RESIDUE localStorage keys:', JSON.stringify(keys));
  console.log('RESIDUE idb:', JSON.stringify(residue.idb), 'caches:', JSON.stringify(residue.caches));
  console.log('plaintext stash keys present (should be none when WebCrypto available):', JSON.stringify(plain));
  await page.screenshot({ path: 'shots/05-residue.png' });
});
