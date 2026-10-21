// STAGING ONLY — stock concurrency test harness. Runs many REAL parallel database sessions, each signed in as a
// staging test user (same permissions as their phone), all hitting apply_stock_txn / save_records at the same time.
// Touches only test items whose id starts with "zz_race_" and marks them deleted when done.
// v5 (2026-10-20): items that test shortage refusals are COUNTED first (S1 rule: only counted items refuse a
// shortage); new S11 checks that an UNcounted item's pick-ups are recorded and never go below 0.
import postgres from "npm:postgres@3.4.4";
// only the SHA-256 of the test key is kept here (the repo is public)
const KEY_SHA256 = "34429ed63084b219cfb60811e9d6c078da168d7a1132f2331bbc44288b6c1624";
async function keyOk(k: string | null) { if (!k) return false; const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(k))); return Array.from(d).map((b) => b.toString(16).padStart(2, "0")).join("") === KEY_SHA256; }
const U = { owner: "49706be4-8266-41a1-9b62-e527046f82cb", manager: "2cefc92f-c691-45d3-872b-5f54db231484", office: "f7dbd26a-3e38-4491-aea4-1074b3047a5b",
  w6: "dd57b323-2a4d-481a-8e8e-11db00950d9e", w7: "5466c837-786c-4e44-8d7e-831214c2decf", w8: "a0d94ae0-1996-4ed0-810b-3c20c09de2a2" };
const WORKERS = [U.w6, U.w7, U.w8, U.manager, U.office];
type R = { name: string; pass: boolean; detail: unknown };
Deno.serve(async (req) => {
  if (!(await keyOk(req.headers.get("x-race-key")))) return new Response("no", { status: 401 });
  const run = (new URL(req.url)).searchParams.get("run") || Date.now().toString(36);
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 24, prepare: false, idle_timeout: 5 });
  const P = `zz_race_${run}_`; const out: R[] = []; const t0 = Date.now();
  const as = <T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>) => sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
    await tx.unsafe("set local role authenticated");
    return await fn(tx);
  });
  const txn = async (uid: string, t: Record<string, unknown>) => {
    try { const r = await as(uid, (tx) => tx`select public.apply_stock_txn(${JSON.stringify(t)}::text::jsonb) as r`); return { ok: true, r: (r as any)[0].r }; }
    catch (e) { return { ok: false, err: String((e as Error).message || e) }; }
  };
  const qty = async (id: string) => { const r = await sql`select (data->>'qty')::numeric as q, deleted from public.records where coll='stock' and id=${id}`; return r.length ? Number(r[0].q) : null; };
  const rows = async (id: string) => Number((await sql`select count(*)::int as n from public.records where coll='stock' and id=${id}`)[0].n);
  const logSum = async (id: string) => { const r = await sql`select coalesce(sum((i->>'change')::numeric),0) as s, count(*)::int as n from public.records l, jsonb_array_elements(l.data->'items') i where l.coll='stockLog' and l.id like ${P + "%"} and i->>'id'=${id}`; return { sum: Number(r[0].s), n: r[0].n }; };
  const setTo = (id: string, n: number) => txn(U.owner, { id: `${P}set_${id}_${n}`, kind: "set", moves: [{ id, name: "race test " + id, set: n }] });
  const seed = async (id: string, n: number) => { await txn(U.owner, { id: `${P}seed_${id}`, kind: "in", moves: [{ id, name: "race test " + id, delta: n }] }); };
  const counted = async (id: string) => Boolean((await sql`select (data ? 'counted') as c from public.records where coll='stock' and id=${id}`)[0]?.c);
  const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
  try {
    // S1 — 5 phones × 20 returns each, all at once, same item
    { const id = P + "A"; await seed(id, 0); const jobs: Promise<any>[] = []; let want = 0;
      for (let w = 0; w < 5; w++) for (let k = 0; k < 20; k++) { const d = rnd(1, 25); want += d; jobs.push(txn(WORKERS[w], { id: `${P}s1_${w}_${k}`, kind: "in", moves: [{ id, delta: d }] })); }
      const res = await Promise.all(jobs); const q = await qty(id); const ls = await logSum(id);
      const qv = Number((await sql`select (data->>'qv')::int as v from public.records where coll='stock' and id=${id}`)[0].v);
      const vs = res.map(r => r.ok ? Number(r.r.qtys[0].qv) : -1); const uniq = new Set(vs).size;
      out.push({ name: "S1 100 returns from 5 phones at once (same item)", pass: res.every(r => r.ok) && q === want && ls.sum === want && uniq === 100, detail: { expected: want, server: q, log_sum: ls.sum, failed: res.filter(r => !r.ok).length, count_version: qv, distinct_versions_answered: uniq } }); }
    // S2 — COUNTED item: mixed take-outs and returns from 5 phones at once; never negative; count = start + every applied change
    { const id = P + "B"; await seed(id, 20); await setTo(id, 20); const isC = await counted(id); const jobs: Promise<any>[] = []; const moves: number[] = [];
      for (let k = 0; k < 200; k++) { const d = Math.random() < 0.55 ? -rnd(1, 12) : rnd(1, 12); moves.push(d); jobs.push(txn(WORKERS[k % 5], { id: `${P}s2_${k}`, kind: d < 0 ? "out" : "in", site: "s1", moves: [{ id, delta: d }] })); }
      const res = await Promise.all(jobs); const applied = res.map((r, i) => r.ok ? moves[i] : 0).reduce((a, b) => a + b, 0);
      const refused = res.filter(r => !r.ok); const onlyShort = refused.every(r => /insufficient_stock/.test(r.err)); const q = await qty(id); const ls = await logSum(id);
      const neg = await sql`select count(*)::int as n from public.records l, jsonb_array_elements(l.data->'items') i where l.coll='stockLog' and l.id like ${P + "s2_%"} and (i->>'after')::numeric < 0`;
      out.push({ name: "S2 200 mixed take-outs/returns from 5 phones at once (counted item)", pass: isC && q === 20 + applied && ls.sum === 20 + applied && onlyShort && neg[0].n === 0 && q! >= 0, detail: { counted: isC, start: 20, applied_changes: applied, expected: 20 + applied, server: q, log_sum: ls.sum, refused_short: refused.length, refused_other: refused.filter(r => !/insufficient/.test(r.err)).map(r => r.err).slice(0, 3), negative_points: neg[0].n } }); }
    // S3 — COUNTED item, over-pick race: 10 in stock, 6 phones each take 3 at the same moment
    { const id = P + "C"; await seed(id, 10); await setTo(id, 10); const res = await Promise.all(WORKERS.concat([U.w7]).map((w, i) => txn(w, { id: `${P}s3_${i}`, kind: "out", site: "s1", moves: [{ id, delta: -3 }] })));
      const ok = res.filter(r => r.ok).length; const q = await qty(id);
      out.push({ name: "S3 10 counted in stock, 6 phones take 3 each at once", pass: ok === 3 && q === 1, detail: { succeeded: ok, refused: res.length - ok, server: q, expected_server: 1 } }); }
    // S4 — the same transaction sent 8 times at once (double tap, retries, two tabs)
    { const id = P + "D"; await seed(id, 0); const t = { id: `${P}s4_dup`, kind: "in", moves: [{ id, delta: 10 }] };
      const res = await Promise.all(Array.from({ length: 8 }, () => txn(U.w7, t))); const q = await qty(id); const dups = res.filter(r => r.ok && r.r.duplicate).length;
      const logs = (await sql`select count(*)::int as n from public.records where coll='stockLog' and id=${t.id}`)[0].n;
      out.push({ name: "S4 same transaction sent 8 times at once", pass: q === 10 && logs === 1 && dups === 7, detail: { server: q, expected: 10, applied_once: res.filter(r => r.ok && !r.r.duplicate).length, answered_duplicate: dups, history_entries: logs } }); }
    // S5 — interrupted request: the server applied it but the phone never got the answer → the phone retries later
    { const id = P + "E"; await seed(id, 0); const t = { id: `${P}s5_lost`, kind: "in", moves: [{ id, delta: 6 }] };
      const first = txn(U.w8, t); await new Promise(r => setTimeout(r, 5)); await Promise.all([first, txn(U.w8, t), txn(U.w8, t)]);
      await new Promise(r => setTimeout(r, 300)); const later = await txn(U.w8, t); const q = await qty(id);
      const changed = await txn(U.w8, { ...t, moves: [{ id, delta: 60 }] });
      out.push({ name: "S5 lost answer + retries (same id) + a tampered resend", pass: q === 6 && later.ok && later.r.duplicate && !changed.ok && /reuse/.test(changed.err), detail: { server: q, expected: 6, retry_answer: later.ok ? later.r : later.err, tampered_resend: changed.ok ? "ACCEPTED" : changed.err } }); }
    // S6 — COUNTED items: a transaction that fails half-way changes nothing; retried later it applies once
    { const a = P + "F1", b = P + "F2"; await seed(a, 5); await seed(b, 1); await setTo(a, 5); await setTo(b, 1); const t = { id: `${P}s6_half`, kind: "out", site: "s1", moves: [{ id: a, delta: -2 }, { id: b, delta: -3 }] };
      const r1 = await txn(U.w6, t); const qa1 = await qty(a), qb1 = await qty(b);
      await txn(U.owner, { id: `${P}s6_restock`, kind: "in", moves: [{ id: b, delta: 5 }] });
      const r2 = await txn(U.w6, t); const r3 = await txn(U.w6, t); const qa2 = await qty(a), qb2 = await qty(b);
      out.push({ name: "S6 half-failed pick-up changes nothing, retry applies once", pass: !r1.ok && qa1 === 5 && qb1 === 1 && r2.ok && !r2.r.duplicate && r3.ok && r3.r.duplicate && qa2 === 3 && qb2 === 3, detail: { first: r1.ok ? "applied" : r1.err, after_fail: { a: qa1, b: qb1 }, after_retry: { a: qa2, b: qb2 }, second_retry_duplicate: r3.ok && r3.r.duplicate } }); }
    // S7 — brand-new item (first scan) counted on 5 phones at the same moment
    { const id = P + "G"; const res = await Promise.all(WORKERS.map((w, i) => txn(w, { id: `${P}s7_${i}`, kind: "in", moves: [{ id, name: "new from scan", delta: 10 }] })));
      const q = await qty(id); const n = await rows(id);
      out.push({ name: "S7 new item counted on 5 phones at once", pass: res.every(r => r.ok) && q === 50 && n === 1, detail: { server: q, expected: 50, item_rows: n } }); }
    // S8 — normal sync tries to write counts while 60 stock transactions run
    { const id = P + "H"; await seed(id, 50); const jobs: Promise<any>[] = []; let want = 50;
      for (let k = 0; k < 60; k++) { const d = rnd(1, 5); want += d; jobs.push(txn(WORKERS[k % 5], { id: `${P}s8_${k}`, kind: "in", moves: [{ id, delta: d }] })); }
      for (let k = 0; k < 30; k++) jobs.push(as(WORKERS[k % 5], tx => tx`select count(*) from public.save_records(${JSON.stringify([{ coll: "stock", id, by: "x", patch: { qty: rnd(0, 9999), counted: 1, note: "sync " + k } }])}::text::jsonb)`).then(() => ({ ok: true })).catch(e => ({ ok: false, err: String(e) })));
      jobs.push(as(U.owner, tx => tx`update public.records set data = jsonb_set(data, '{qty}', '777') where coll='stock' and id=${id}`).then(() => ({ ok: true })).catch(e => ({ ok: false, err: String(e) })));
      await Promise.all(jobs); const q = await qty(id); const c = await counted(id);
      out.push({ name: "S8 sync + direct writes of counts (and a faked 'counted' stamp) during 60 transactions", pass: q === want && !c, detail: { server: q, expected: want, stamp_faked: c } }); }
    // S9 — two items in opposite order from many phones at once (deadlock check)
    { const a = P + "I1", b = P + "I2"; await seed(a, 0); await seed(b, 0); const jobs: Promise<any>[] = [];
      for (let k = 0; k < 60; k++) jobs.push(txn(WORKERS[k % 5], { id: `${P}s9_${k}`, kind: "in", moves: k % 2 ? [{ id: a, delta: 1 }, { id: b, delta: 2 }] : [{ id: b, delta: 2 }, { id: a, delta: 1 }] }));
      const res = await Promise.all(jobs); const qa = await qty(a), qb = await qty(b);
      out.push({ name: "S9 60 two-item transactions in opposite order at once", pass: res.every(r => r.ok) && qa === 60 && qb === 120, detail: { a: qa, b: qb, expected: [60, 120], failed: res.filter(r => !r.ok).map(r => r.err).slice(0, 3) } }); }
    // S10 — permissions
    { const id = P + "J"; await seed(id, 4);
      const wset = await txn(U.w7, { id: `${P}s10_set`, kind: "set", moves: [{ id, set: 400 }] });
      const oset = await txn(U.office, { id: `${P}s10_oset`, kind: "set", moves: [{ id, set: 9, expect: 4 }] });
      const stale = await txn(U.owner, { id: `${P}s10_stale`, kind: "set", moves: [{ id, set: 1, expect: 4 }] });
      const anon = await sql.begin(async tx => { await tx.unsafe("set local role anon"); try { await tx`select public.apply_stock_txn(${JSON.stringify({ id: P + "s10_anon", kind: "in", moves: [{ id, delta: 100 }] })}::text::jsonb)`; return "ACCEPTED"; } catch (e) { return String((e as Error).message); } }).catch(e => String((e as Error).message));
      const q = await qty(id);
      out.push({ name: "S10 permissions: worker can't set counts, office can (with recount check), stranger can't", pass: !wset.ok && oset.ok && !stale.ok && anon !== "ACCEPTED" && q === 9, detail: { worker_set: wset.ok ? "ACCEPTED" : wset.err, office_set: oset.ok, stale_count: stale.ok ? "ACCEPTED" : stale.err, not_signed_in: anon, server: q } }); }
    // S11 — UNcounted item (2 on the shelf per the app, never counted): 4 phones take 3 each at once → all recorded, never below 0
    { const id = P + "K"; await seed(id, 2); const isC = await counted(id);
      const res = await Promise.all(WORKERS.slice(0, 4).map((w, i) => txn(w, { id: `${P}s11_${i}`, kind: "out", site: "s1", moves: [{ id, delta: -3 }] })));
      const q = await qty(id);
      const flagged = (await sql`select count(*)::int as n from public.records l, jsonb_array_elements(l.data->'items') i where l.coll='stockLog' and l.id like ${P + "s11_%"} and i->>'uncounted' = 'true'`)[0].n;
      const neg = (await sql`select count(*)::int as n from public.records l, jsonb_array_elements(l.data->'items') i where l.coll='stockLog' and l.id like ${P + "s11_%"} and (i->>'after')::numeric < 0`)[0].n;
      out.push({ name: "S11 uncounted item: 4 phones take 3 each at once — all recorded, count stays at 0, never negative", pass: !isC && res.every(r => r.ok) && q === 0 && flagged === 4 && neg === 0, detail: { counted: isC, succeeded: res.filter(r => r.ok).length, server: q, marked_uncounted: flagged, negative_points: neg, errors: res.filter(r => !r.ok).map(r => r.err) } }); }
  } catch (e) { out.push({ name: "harness error", pass: false, detail: String((e as Error).stack || e) }); }
  finally {
    try { await sql`update public.records set deleted = true where coll='stock' and id like ${P + "%"}`; } catch (_) { /* best effort */ }
    await sql.end({ timeout: 5 });
  }
  return new Response(JSON.stringify({ run, ms: Date.now() - t0, passed: out.filter(r => r.pass).length, failed: out.filter(r => !r.pass).length, results: out }), { headers: { "Content-Type": "application/json" } });
});
