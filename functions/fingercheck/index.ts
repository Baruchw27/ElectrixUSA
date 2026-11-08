// Supabase Edge Function "fingercheck" — Electrix ⇄ Fingercheck, READ-ONLY until verified.
// Two Fingercheck companies: "usa" (01 Electrix USA) and "inc" (01 ELECTRIX US INC).
// Keys: typed in the app by the owner (Settings → Fingercheck connection) into private.fc_keys — write-only, read here
// through fc_keys_server() (service role only). Old Edge Function secrets still work as a fallback:
//   FINGERCHECK_APIKEY, FINGERCHECK_CLIENT_SECRET (= the "usa" company)
// Nothing is ever written to Fingercheck by this version.
// Only the owner or Payroll (signed in) may call it. Actions (POST JSON {action, co?, ...}):
//   status     → which keys are saved; for each company: can Fingercheck be reached, active employee count, next payroll
//   sample     → Fingercheck's own example punch object (to build the punch sender exactly to their format)
//   employees  → one company's active employees (number + name only) matched by name to Electrix people
//   hours      → one week (Sunday–Saturday, New York time): Electrix payable hours per person next to Fingercheck's time cards
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FC = "https://developer.fingercheck.com/api/";
const TZ = "America/New_York";
const PAID_LUNCH_MIN = 40, OT_AFTER = 40, PAY_FROM_H = 8;
const COS = ["usa", "inc"] as const;
const CO_NAME: Record<string, string> = { usa: "Electrix USA", inc: "Electrix US Inc" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" } });

function dkey(ms: number) { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)); }
function nyMidnight(day: string) {
  const [y, m, d] = day.split("-").map(Number); let t = Date.UTC(y, m - 1, d, 5);
  for (let i = 0; i < 3; i++) { const k = dkey(t); const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(t))) % 24;
    if (k === day && h === 0) break; t -= h * 3600000; if (dkey(t) !== day) t += 86400000; }
  return t;
}
type Punch = { id: string; who: string; in: number; out?: number | null; away?: number | null; breaks?: { s: number; e: number }[]; breakStart?: number | null;
  trips?: { left: number; back?: number }[]; rejected?: boolean; pending?: boolean; voided?: boolean; site?: string };
const payCounts = (p: Punch) => !!p && !p.rejected && !p.pending && !p.voided;
function ivLen(iv: number[][]) { iv = iv.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]); let t = 0, cs: number | null = null, ce = 0;
  for (const [s, e] of iv) { if (cs === null || s > ce) { if (cs !== null) t += ce - cs; cs = s; ce = e; } else if (e > ce) ce = e; } if (cs !== null) t += ce - cs; return t; }
function lunchMs(p: Punch, now: number) { const end = p.out || p.away || now; const c = (a: number, b: number) => [Math.max(+a || 0, p.in), Math.min(+b || 0, end)];
  const T = (p.trips || []).filter((tr) => tr && tr.back).map((tr) => c(tr.left, tr.back!));
  const L = (p.breaks || []).filter((b) => b && b.s && b.e).map((b) => c(b.s, b.e)); if (p.breakStart && !p.out && !p.away) L.push(c(p.breakStart, now));
  if (!L.length) return 0; return Math.max(0, ivLen(L.concat(T)) - ivLen(T)); }
// Baruch 11/8: pay starts at 8:00 New York time — a clock-in before 8 counts from 8
function payStart(p: Punch) { const eight = nyMidnight(dkey(p.in)) + PAY_FROM_H * 3600000; return Math.max(p.in, eight); }
function weekHours(punches: Punch[], ws: number, we: number, now: number) {
  const out: Record<string, { days: number[]; payable: number; paidLunchMin: number; unpaidLunchMin: number; runMin: number; reg: number; ot: number; entries: number }> = {};
  const byDay: Record<string, Punch[]> = {};
  for (const p of punches) if (p && p.in != null && payCounts(p)) (byDay[p.who + "|" + dkey(p.in)] ||= []).push(p);
  for (const k in byDay) byDay[k].sort((a, b) => (a.in - b.in) || String(a.id).localeCompare(String(b.id)));
  for (const k in byDay) {
    let used = 0;
    for (const p of byDay[k]) {
      const tot = lunchMs(p, now); const paid = Math.min(tot, Math.max(0, PAID_LUNCH_MIN * 60000 - used)); used += tot; const unpaid = tot - paid;
      if (p.in < ws || p.in >= we) continue;
      if (!p.out && !p.away && now - p.in > 14 * 3600000) continue;
      const end = p.out || p.away || now; const h = Math.max(0, (end - payStart(p) - unpaid) / 3600000);
      const r = (out[p.who] ||= { days: [0, 0, 0, 0, 0, 0, 0], payable: 0, paidLunchMin: 0, unpaidLunchMin: 0, runMin: 0, reg: 0, ot: 0, entries: 0 });
      const di = Math.round((nyMidnight(dkey(p.in)) - ws) / 86400000); if (di >= 0 && di < 7) r.days[di] += h;
      r.payable += h; r.paidLunchMin += paid / 60000; r.unpaidLunchMin += unpaid / 60000; r.entries++;
      r.runMin += ivLen((p.trips || []).filter((tr) => tr && tr.left).map((tr) => [Math.max(+tr.left || 0, p.in), Math.min(+(tr.back || now), end)])) / 60000;
    }
  }
  for (const w in out) { const r = out[w]; r.reg = Math.min(r.payable, OT_AFTER); r.ot = Math.max(0, r.payable - OT_AFTER);
    for (const f of ["payable", "paidLunchMin", "unpaidLunchMin", "runMin", "reg", "ot"] as const) (r as any)[f] = Math.round((r as any)[f] * 100) / 100; r.days = r.days.map((x) => Math.round(x * 100) / 100); }
  return out;
}
const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const asList = (b: unknown): any[] => Array.isArray(b) ? b : (b && typeof b === "object" && Array.isArray((b as any).Data)) ? (b as any).Data : [];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const auth = req.headers.get("authorization") || "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: me } = await user.rpc("my_emp_data");
  const allowed = me && (me.role === "owner" || (me.role === "office" && me.title === "Payroll"));
  if (!allowed) return json({ error: "only the owner or Payroll" }, 403);
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: saved } = await adm.rpc("fc_keys_server");
  const ks = (saved || {}) as Record<string, string>;
  const KEY = ks.api || Deno.env.get("FINGERCHECK_APIKEY") || "";
  const secretOf = (co: string) => ks[co] || (co === "usa" ? Deno.env.get("FINGERCHECK_CLIENT_SECRET") || "" : "");
  const fc = async (co: string, path: string) => {
    try {
      const r = await fetch(FC + path, { headers: { APIKEY: KEY, ClientSecretKey: secretOf(co), Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      const txt = await r.text(); let body: unknown = txt; try { body = JSON.parse(txt); } catch (_) { /* text */ }
      return { status: r.status, body };
    } catch (e) { return { status: 0, body: String(e).slice(0, 200) }; }
  };
  let a: Record<string, string> = {}; try { a = await req.json(); } catch (_) { /* empty */ }
  const action = a.action || "status";
  const co = COS.includes(a.co as any) ? a.co : "inc";
  const has = (c: string) => !!(KEY && secretOf(c));
  if (action === "status") {
    const out: Record<string, unknown> = { keys: { api: !!KEY, usa: !!secretOf("usa"), inc: !!secretOf("inc") }, write: false };
    for (const c of COS) {
      if (!has(c)) { out[c] = { name: CO_NAME[c], connected: false, why: "keys not saved" }; continue; }
      const [emp, up] = await Promise.all([fc(c, "v1/Employees/GetAllActiveEmployees"), fc(c, "v1/payroll/GetUpcomingPayrolls")]);
      const list = asList(emp.body); const ups = asList(up.body);
      const next = ups[0] ? (ups[0].CheckDate ?? ups[0].checkDate ?? null) : null;
      out[c] = { name: CO_NAME[c], connected: emp.status === 200, status: emp.status, employees: emp.status === 200 ? list.length : null,
                 nextCheck: next, why: emp.status === 200 ? null : (emp.status === 401 || emp.status === 403 ? "Fingercheck refused the keys" : "Fingercheck answered " + emp.status) };
    }
    return json(out);
  }
  if (!has(co) && action !== "hours") return json({ error: "Fingercheck keys are not saved for " + CO_NAME[co] }, 400);
  if (action === "sample") { const r = await fc(co, "v1/Punch/GetClockPunchMetaDataListSampleObject"); return json(r, r.status === 200 ? 200 : 502); }
  const { data: emps } = await adm.from("records").select("id,data").eq("coll", "emps").eq("deleted", false);
  const people = (emps || []).map((e: any) => ({ id: e.id, name: e.data?.name || "", clock: e.data?.clock !== false, inactive: !!e.data?.inactive, fc: e.data?.fcNum || null }))
    .filter((e) => !e.inactive);
  if (action === "employees") {
    const r = await fc(co, "v1/Employees/GetAllActiveEmployees"); if (r.status !== 200) return json({ error: "Fingercheck answered " + r.status, body: String(r.body).slice(0, 300) }, 502);
    const list = asList(r.body).map((x: any) => ({ number: String(x.EmployeeNumber ?? x.employeeNumber ?? ""), name: [x.FirstName ?? x.firstName, x.LastName ?? x.lastName].filter(Boolean).join(" ") }));
    const res = people.filter((p) => p.clock).map((p) => {
      const n = norm(p.name); const first = n.split(" ")[0];
      const c = list.filter((f) => { const fn = norm(f.name); return fn === n || fn.split(" ")[0] === first || fn.includes(n) || n.includes(fn); });
      return { electrix: p.id, name: p.name, linked: p.fc, candidates: c, unique: c.length === 1 };
    });
    return json({ company: CO_NAME[co], fingercheck_active: list.length, people: res, note: "Nothing was linked or changed." });
  }
  if (action === "hours") {
    const week = a.week && /^\d{4}-\d{2}-\d{2}$/.test(a.week) ? a.week : dkey(Date.now());
    let ws = nyMidnight(week); const dow = new Date(ws + 12 * 3600000).getUTCDay(); ws = nyMidnight(dkey(ws - dow * 86400000 + 12 * 3600000));
    const sun = dkey(ws + 12 * 3600000), we = nyMidnight(dkey(ws + 7 * 86400000 + 12 * 3600000)), sat = dkey(we - 12 * 3600000);
    const { data: rows } = await adm.from("records").select("id,data").eq("coll", "punches").eq("deleted", false)
      .gte("data->>in", String(ws - 86400000)).lt("data->>in", String(we + 86400000));
    const punches = (rows || []).map((r: any) => ({ ...(r.data || {}), id: r.id, in: Number(r.data?.in), out: r.data?.out ? Number(r.data.out) : null, away: r.data?.away ? Number(r.data.away) : null })) as Punch[];
    const hrs = weekHours(punches, ws, we, Date.now());
    const electrix = people.filter((p) => p.clock).map((p) => ({ electrix: p.id, name: p.name, fcNum: p.fc, ...(hrs[p.id] || { payable: 0 }) }));
    let fingercheck: unknown = "keys not saved";
    if (has(co)) { const r = await fc(co, `v1/Reports/GetAllTimeCardsForDateRange?startDate=${sun}&endDate=${sat}`); fingercheck = r.status === 200 ? r.body : { status: r.status, body: String(r.body).slice(0, 300) }; }
    return json({ company: CO_NAME[co], week: { start: sun, end: sat, rule: "Sunday–Saturday, pay from 8:00, overtime after 40 payable hours; 40 min paid lunch per workday" }, electrix, fingercheck });
  }
  return json({ error: "unknown action" }, 400);
});
