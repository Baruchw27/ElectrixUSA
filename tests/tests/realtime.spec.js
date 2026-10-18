// Realtime isolation: Worker A subscribes to the records feed; Worker B changes B's own private note; A must NOT
// receive it. Uses two real supabase-js clients over the live websocket. (ChatGPT area 7.)
const { test, expect } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const { cfg } = require('./_helpers');
const C = cfg();

test('Worker A never receives Worker B private note over realtime', async () => {
  const a = createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: false } });
  const b = createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: false } });
  await a.auth.signInWithPassword({ email: C.accounts.workerA.email, password: C.accounts.workerA.password });
  await b.auth.signInWithPassword({ email: C.accounts.workerB.email, password: C.accounts.workerB.password });
  const leaked = [];
  const ch = a.channel('records').on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (p) => {
    const r = p.new || {};
    if (r.coll === 'keep' && r.id === 'knB1') leaked.push(r);
  });
  await new Promise((res) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') res(); }));
  // B touches B's own private note
  await b.from('records').update({ data: { owner: 'u8', type: 'text', title: 'Worker B private note (TEST)', body: 'changed-by-B ' + Date.now() } }).eq('coll', 'keep').eq('id', 'knB1');
  await new Promise((r) => setTimeout(r, 4000)); // give realtime time to (not) deliver
  await a.removeAllChannels();
  expect(leaked, 'A must not receive B private note events').toEqual([]);
});
