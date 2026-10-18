// Job Hours Dashboard — DB-level privacy. Proves over real HTTPS (REST) that crew leaders
// receive ONLY their own punch rows (identical to a field worker), while Payroll/owner see everyone.
// This is the enforcement the dashboard relies on: it is in RLS (can_see2), not just hidden buttons.
// Staging only. Read-only — no writes.
const { test, expect, request } = require('@playwright/test');
const { cfg, login, auth } = require('./_helpers');
const C = cfg();
const REST = C.supabaseUrl + '/rest/v1/records';

let LEADER, WORKER, PAYROLL, OWNER;

test.beforeAll(async () => {
  const ctx = await request.newContext();
  LEADER  = (await login(ctx, C, C.accounts.leader.email,  C.accounts.leader.password)).token;
  WORKER  = (await login(ctx, C, C.accounts.workerA.firstName || C.accounts.workerA.email, C.accounts.workerA.password)).token;
  PAYROLL = (await login(ctx, C, C.accounts.payroll.email, C.accounts.payroll.password)).token;
  OWNER   = (await login(ctx, C, C.accounts.owner.email,   C.accounts.owner.password)).token;
  expect(LEADER,  'leader sign-in').toBeTruthy();
  expect(WORKER,  'worker sign-in').toBeTruthy();
  expect(PAYROLL, 'payroll sign-in').toBeTruthy();
  await ctx.dispose();
});

async function visibleWho(request, token) {
  const r = await request.get(`${REST}?select=data&coll=eq.punches`, { headers: auth(C, token) });
  expect(r.ok(), 'punches read ok').toBeTruthy();
  const rows = await r.json();
  return [...new Set(rows.map(x => x.data && x.data.who).filter(Boolean))].sort();
}

test('crew leader sees ONLY their own punches (RLS, not a hidden button)', async ({ request }) => {
  const who = await visibleWho(request, LEADER);
  expect(who, `leader should see only ${C.accounts.leader.emp}`).toEqual([C.accounts.leader.emp]);
});

test('field worker sees ONLY their own punches', async ({ request }) => {
  const who = await visibleWho(request, WORKER);
  expect(who).toEqual([C.accounts.workerA.emp]);
});

test('crew leader cannot read a specific co-worker punch (returns empty)', async ({ request }) => {
  // pB1 belongs to Worker B (u8); a crew leader must not receive it
  const r = await request.get(`${REST}?select=coll,id,data&coll=eq.punches&id=eq.pB1`, { headers: auth(C, LEADER) });
  expect(r.ok()).toBeTruthy();
  expect(await r.json(), 'leader reading co-worker punch pB1').toEqual([]);
});

test('Payroll sees everyone (positive control for the dashboard audience)', async ({ request }) => {
  const who = await visibleWho(request, PAYROLL);
  expect(who.length, 'payroll should see multiple employees').toBeGreaterThan(1);
  expect(who).toContain(C.accounts.workerA.emp);
  expect(who).toContain(C.accounts.workerB.emp);
});

test('owner sees everyone (positive control)', async ({ request }) => {
  if (!OWNER) test.skip(true, 'owner sign-in unavailable');
  const who = await visibleWho(request, OWNER);
  expect(who.length).toBeGreaterThan(1);
});
