// Live security tests against Electrix USA STAGING over real HTTPS (REST, RPC, Storage, edge functions).
// These are the account-to-account checks Claude could only run inside the database. Run from any machine with
// internet. They make a few throwaway writes (prefixed test_) and clean them up; they never touch production.
const { test, expect, request } = require('@playwright/test');
const { cfg, login, auth } = require('./_helpers');
const C = cfg();
const REST = C.supabaseUrl + '/rest/v1/records';
let A, B, OWNER; // tokens

test.beforeAll(async () => {
  const ctx = await request.newContext();
  A = (await login(ctx, C, C.accounts.workerA.firstName || C.accounts.workerA.email, C.accounts.workerA.password)).token;
  B = (await login(ctx, C, C.accounts.workerB.email, C.accounts.workerB.password)).token;
  OWNER = (await login(ctx, C, C.accounts.owner.email, C.accounts.owner.password)).token;
  expect(A, 'Worker A sign-in').toBeTruthy();
  expect(B, 'Worker B sign-in').toBeTruthy();
  await ctx.dispose();
});

test('1. login: unknown user and wrong password both return the same generic failure (no existence leak)', async ({ request }) => {
  const wrong = await login(request, C, C.accounts.workerB.email, 'definitely-wrong-123');
  const unknown = await login(request, C, 'Nobody Real At All', 'whatever-123');
  expect(wrong.token).toBeFalsy();
  expect(unknown.token).toBeFalsy();
  expect(wrong.status).toBe(unknown.status); // identical response for "wrong password" and "no such user"
});

test('2a. Worker A cannot read Worker B hours / receipts / private notes / time-off', async ({ request }) => {
  for (const [coll, id] of [['punches','pB1'],['exps','xB1'],['keep','knB1'],['timeoff','toB1']]) {
    const r = await request.get(`${REST}?select=coll,id,data&coll=eq.${coll}&id=eq.${id}`, { headers: auth(C, A) });
    expect(r.ok()).toBeTruthy();
    expect(await r.json(), `A reading B ${coll}/${id}`).toEqual([]);
  }
});

test('2b. Worker A cannot read Worker B home address / emergency contact', async ({ request }) => {
  // address/emerg are no longer on the shared employee record...
  const emps = await request.get(`${REST}?select=data&coll=eq.emps&id=eq.${C.accounts.workerB.emp}`, { headers: auth(C, A) });
  const row = (await emps.json())[0];
  expect(row && row.data && (row.data.addr || row.data.emerg), 'addr/emerg must not be on emps').toBeFalsy();
  // ...and the private HR record for B is not visible to A
  const hr = await request.get(`${REST}?select=data&coll=eq.emphr&id=eq.${C.accounts.workerB.emp}`, { headers: auth(C, A) });
  expect(await hr.json(), 'A reading B emphr').toEqual([]);
});

test('2c. the office (owner) CAN read B private HR (positive control)', async ({ request }) => {
  const hr = await request.get(`${REST}?select=data&coll=eq.emphr&id=eq.${C.accounts.workerB.emp}`, { headers: auth(C, OWNER) });
  expect((await hr.json()).length, 'owner should see B emphr').toBe(1);
});

async function snapshot(request, coll, id) {
  const r = await request.get(`${REST}?select=data&coll=eq.${coll}&id=eq.${id}`, { headers: auth(C, OWNER) });
  return ((await r.json())[0] || {}).data || {};
}
test('3. Worker A cannot promote self, approve own hours, or change a site price (server must REJECT, and state unchanged)', async ({ request }) => {
  const tries = [
    ['emps', C.accounts.workerA.emp, { role: 'manager', all: true }],
    ['punches', 'pA2', { approvedBy: C.accounts.workerA.emp }],
    ['sites', 's1', { price: 1 }],
  ];
  for (const [coll, id, patch] of tries) {
    const before = await snapshot(request, coll, id);
    const r = await request.patch(`${REST}?coll=eq.${coll}&id=eq.${id}`, {
      headers: { ...auth(C, A), 'Content-Type': 'application/json', Prefer: 'return=representation' },
      data: { data: patch },
    });
    const status = r.status();
    const after = await snapshot(request, coll, id);
    // 1) the server must REJECT a direct forbidden PATCH with a 4xx (not a 2xx that silently changed nothing)
    expect([400,401,403,409,422], `${coll}/${id}: server should reject with 4xx, got ${status}`).toContain(status);
    // 2) and the value must be unchanged
    for (const k of Object.keys(patch)) expect(JSON.stringify(after[k]), `${coll}.${k} changed!`).toBe(JSON.stringify(before[k]));
  }
});

test('4. Worker A cannot move a record to another collection or change its id', async ({ request }) => {
  for (const patch of [{ __col: 'coll', val: 'keep' }, { __col: 'id', val: 'hacked1' }]) {
    const body = {}; body[patch.__col] = patch.val;
    const r = await request.patch(`${REST}?coll=eq.punches&id=eq.pA3`, {
      headers: { ...auth(C, A), 'Content-Type': 'application/json' }, data: body,
    });
    expect([400,401,403,404,409,422], `moving record via ${patch.__col}`).toContain(r.status());
  }
});

test('5a. direct PATCH of a job A did not create is REJECTED with 4xx and does not persist', async ({ request }) => {
  const before = await snapshot(request, 'jobs', 'j1');
  const r = await request.patch(`${REST}?coll=eq.jobs&id=eq.j1`, {
    headers: { ...auth(C, A), 'Content-Type': 'application/json', Prefer: 'return=representation' },
    data: { data: { desc: 'PWNED-by-A' } },
  });
  expect([400,401,403,409,422], `server should reject, got ${r.status()}`).toContain(r.status());
  const after = await snapshot(request, 'jobs', 'j1');
  expect(after.desc, 'forbidden edit must not persist').toBe(before.desc);
});
test('5b. the app sync path (save_records RPC) is intentionally silent on refusal; the row must stay unchanged', async ({ request }) => {
  // The app calls save_records, which SKIPS rows it may not write (no error). That is by design; the app surfaces it
  // to the user via countRejected -> toast (UI test). Here we confirm the forbidden row is not changed by the RPC.
  const before = await snapshot(request, 'jobs', 'j1');
  await request.post(C.supabaseUrl + '/rest/v1/rpc/save_records', {
    headers: { ...auth(C, A), 'Content-Type': 'application/json' },
    data: { rows: [{ coll: 'jobs', id: 'j1', patch: { desc: 'PWNED-via-rpc' }, by: C.accounts.workerA.emp }] },
  });
  const after = await snapshot(request, 'jobs', 'j1');
  expect(after.desc, 'save_records must not apply a forbidden change').toBe(before.desc);
});

test('6a. Worker A cannot download Worker B private media file', async ({ request }) => {
  const url = C.supabaseUrl + '/storage/v1/object/authenticated/files/media/seedB_private.png';
  const r = await request.get(url, { headers: auth(C, A) });
  expect([400,401,403,404], 'A downloading B media').toContain(r.status());
});

test('6b. Worker B CAN download own media file (positive control)', async ({ request }) => {
  const url = C.supabaseUrl + '/storage/v1/object/authenticated/files/media/seedB_private.png';
  const r = await request.get(url, { headers: auth(C, B) });
  expect(r.ok(), 'B downloading own media').toBeTruthy();
});

test('6c. Worker A cannot list Worker B receipt folder', async ({ request }) => {
  const r = await request.post(C.supabaseUrl + '/storage/v1/object/list/files', {
    headers: { ...auth(C, A), 'Content-Type': 'application/json' },
    data: { prefix: 'exps/xB1/', limit: 100, offset: 0 },
  });
  const items = r.ok() ? await r.json() : [];
  expect(Array.isArray(items) ? items.length : 0, 'B receipt folder listing for A').toBe(0);
});

test('6d. Worker A cannot overwrite Worker B existing receipt file', async ({ request }) => {
  const url = C.supabaseUrl + '/storage/v1/object/files/exps/xB1/rec_d_seed.png';
  const r = await request.put(url, { headers: { ...auth(C, A), 'x-upsert': 'true', 'Content-Type': 'image/png' }, data: Buffer.from([0x89,0x50,0x4e,0x47]) });
  expect([400,401,403,409], 'A overwriting B file').toContain(r.status());
});

test('7. the anonymous name->email lookup is no longer reachable from the API', async ({ request }) => {
  const r = await request.post(C.supabaseUrl + '/rest/v1/rpc/resolve_login', {
    headers: { apikey: C.anonKey, 'Content-Type': 'application/json' }, data: { q: 'Bruno WorkerB (TEST)' },
  });
  expect([401,403,404], 'anon resolve_login').toContain(r.status());
});
