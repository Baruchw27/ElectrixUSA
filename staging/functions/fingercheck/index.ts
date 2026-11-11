// Supabase Edge Function "fingercheck" — Electrix ⇄ Fingercheck, READ-ONLY until verified.
// Two Fingercheck companies: "usa" (01 Electrix USA) and "inc" (01 ELECTRIX US INC).
// Keys: typed in the app by the owner (Settings → Fingercheck connection) into private.fc_keys — write-only, read here
// through fc_keys_server() (service role only). Old Edge Function secrets still work as a fallback:
//   FINGERCHECK_APIKEY, FINGERCHECK_CLIENT_SECRET (= the "usa" company)
// Nothing is written to Fingercheck except by action 'push' with send=true while server_config fc_write='on'.
// Only the owner or Payroll (signed in) may call it. Actions (POST JSON {action, co?, ...}):
//   status     → which keys are saved; for each company: can Fingercheck be reached, active employee count, next payroll
//   sample     → Fingercheck's own example punch object (to build the punch sender exactly to their format)
//   employees  → one company's active employees (number + name only) matched by name to Electrix people
//   import     → {co, from, to, write} past time cards → punches (src 'fingercheck'), paychecks → 'fcpay'; read-only toward Fingercheck
//   hours      → one week (Sunday–Saturday, New York time): Electrix payable hours per person next to Fingercheck's time cards
//   push       → (Baruch 11/10) hours fixed in the app → Fingercheck. {ids, send}. Without send=true it only PREVIEWS what would
//                be sent. Sending needs the server switch server_config fc_write='on' (off by default) — only hours (punches)
//                are added / changed / removed; rates, employees and paychecks are never touched.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FC = "https://developer.fingercheck.com/api/";
const TZ = "America/New_York";
const PAID_LUNCH_MIN = 40, OT_AFTER = 40, PAY_FROM_H = 8;
const COS = ["usa", "inc"] as const;
const CO_NAME: Record<string, string> = { usa: "Electrix USA", inc: "Electrix US Inc" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" } });

function dayAfter(d: string) { return new Date(Date.parse(d + "T12:00:00Z") + 86400000).toISOString().slice(0, 10); }
function dayBefore(d: string) { return new Date(Date.parse(d + "T12:00:00Z") - 86400000).toISOString().slice(0, 10); }
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
// a New York wall-clock time (correct on the two daylight-saving days too)
function nyAt(day: string, h: number, mi: number) {
  const [y, mo, d] = day.split("-").map(Number);
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  for (const off of [4, 5]) { const t = Date.UTC(y, mo - 1, d, h + off, mi); const f = fmt.formatToParts(new Date(t)); const g = (k: string) => Number((f.find((x) => x.type === k) || { value: "-1" }).value);
    if (g("hour") % 24 === h && g("minute") === mi && g("day") === d) return t; }
  return Date.UTC(y, mo - 1, d, h + 5, mi);
}
// Baruch 11/8: pay starts at 8:00 New York time — a clock-in before 8 counts from 8
function payStart(p: Punch) { if ((p as any).src === "fingercheck") return p.in; return Math.max(p.in, nyAt(dkey(p.in), PAY_FROM_H, 0)); }
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

const handle = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // Baruch 11/11: the server itself (the hourly timer) may run the automatic import — it proves itself with the server
  // secret; it can only bring hours IN from Fingercheck (import / auto), never send anything there
  const pushSecret = req.headers.get("x-push-secret") || "";
  let server = false; let me: any = { id: "server" };
  if (pushSecret) { const { data: sc } = await adm.from("server_config").select("v").eq("k", "secret").maybeSingle(); server = !!sc?.v && sc.v.length >= 16 && sc.v === pushSecret; }
  if (!server) {
    const auth = req.headers.get("authorization") || "";
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: m0 } = await user.rpc("my_emp_data"); me = m0;
    const allowed = me && (me.role === "owner" || (me.role === "office" && me.title === "Payroll"));
    if (!allowed) return json({ error: "only the owner or Payroll" }, 403);
  }
  const { data: saved } = await adm.rpc("fc_keys_server");
  const ks = (saved || {}) as Record<string, string>;
  const KEY = ks.api || Deno.env.get("FINGERCHECK_APIKEY") || "";
  const secretOf = (co: string) => ks[co] || (co === "usa" ? Deno.env.get("FINGERCHECK_CLIENT_SECRET") || "" : "");
  const fc = async (co: string, path: string) => {
    try {
      const r = await fetch(FC + path, { headers: { APIKEY: KEY, ClientSecretKey: secretOf(co), Accept: "application/json" }, signal: AbortSignal.timeout(60000) });
      const txt = await r.text(); let body: unknown = txt; try { body = JSON.parse(txt); } catch (_) { /* text */ }
      return { status: r.status, body };
    } catch (e) { return { status: 0, body: String(e).slice(0, 200) }; }
  };
  const fcWrite = async (co: string, method: string, path: string, body: unknown) => {
    try {
      const r = await fetch(FC + path, { method, headers: { APIKEY: KEY, ClientSecretKey: secretOf(co), Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
      const txt = await r.text(); let b: unknown = txt; try { b = JSON.parse(txt); } catch (_) { /* text */ }
      const ok = r.status >= 200 && r.status < 300 && !(b && typeof b === "object" && (b as any).IsSuccessStatusCode === false);
      return { ok, status: r.status, body: typeof b === "string" ? b.slice(0, 300) : b };
    } catch (e) { return { ok: false, status: 0, body: String(e).slice(0, 200) }; }
  };
  let a: Record<string, any> = {}; try { a = await req.json(); } catch (_) { /* empty */ }
  const action = a.action || "status";
  if (server && action !== "auto" && action !== "import") return json({ error: "the server may only bring hours in" }, 403);
  if (server && action === "import") { a.write = "true"; a.only = undefined; }
  const co = COS.includes(a.co as any) ? a.co : "inc";
  const has = (c: string) => !!(KEY && secretOf(c));
  // Baruch 11/10: Fingercheck problems go to the bell of Baruch + Payroll (server_config fc_alert_to, default owner u1 + Shia o1),
  // in each person's language
  const notifyFc = async (en: string, es: string, link: Record<string, unknown>) => {
    try {
      const { data: c } = await adm.from("server_config").select("v").eq("k", "fc_alert_to").maybeSingle();
      let to: string[] = ["u1", "o1"]; try { const j = JSON.parse(c?.v || "null"); if (Array.isArray(j) && j.length) to = j.map(String); } catch (_) { /* default */ }
      const { data: es0 } = await adm.from("records").select("id,data").eq("coll", "emps").in("id", to);
      const now = Date.now(); const rows: any[] = [];
      for (const e of es0 || []) { if (!e.data || e.data.inactive) continue; const nid = "n" + crypto.randomUUID().replace(/-/g, "");
        rows.push({ coll: "inbox", id: nid, deleted: false, updated_by: "server", updated_at: new Date().toISOString(),
          data: { id: nid, to: e.id, msg: (e.data.lang === "es" ? es : en).slice(0, 900), kind: "info", ts: now, read: false, link, auto: true } }); }
      if (rows.length) await adm.from("records").upsert(rows, { onConflict: "coll,id" });
    } catch (_) { /* a notice must never stop the work */ }
  };
  if (action === "status") {
    const out: Record<string, unknown> = { keys: { api: !!KEY, usa: !!secretOf("usa"), inc: !!secretOf("inc") }, write: false };
    for (const c of COS) {
      if (!has(c)) { out[c] = { name: CO_NAME[c], connected: false, why: "keys not saved" }; continue; }
      const [emp, up] = await Promise.all([fc(c, "v1/Employees/GetAllActiveEmployees"), fc(c, "v1/payroll/GetUpcomingPayrolls")]);
      const list = asList(emp.body); const ups = asList(up.body);
      const next = ups[0] ? (ups[0].CheckDate ?? ups[0].checkDate ?? ups[0].Code ?? null) : null;
      out[c] = { name: CO_NAME[c], connected: emp.status === 200, status: emp.status, employees: emp.status === 200 ? list.length : null,
                 nextCheck: next, why: emp.status === 200 ? null : (emp.status === 401 || emp.status === 403 ? "Fingercheck refused the keys" : "Fingercheck answered " + emp.status) };
    }
    return json(out);
  }
  // Baruch 11/11 (approved): automatic import, run by the hourly timer. 8 AM–9 PM New York: today's punches, both companies.
  // 6 AM: the last 7 days again (late fixes Payroll made in Fingercheck). Read-only toward Fingercheck; hours fixed in the
  // app and not sent yet are kept (same rules as the import button); the travel recount runs by itself on every change.
  // Switch: server_config fc_auto = 'on'. Never reaches back before fc_auto_from (paid weeks stay as they are).
  if (action === "auto") {
    const { data: cf } = await adm.from("server_config").select("k,v").in("k", ["fc_auto", "fc_auto_from"]);
    const cv = Object.fromEntries((cf || []).map((r: any) => [r.k, r.v]));
    if (cv.fc_auto !== "on" && !a.force) return json({ skipped: "fc_auto is off" });
    const hr = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(a.now ? Number(a.now) : Date.now()))) % 24;
    const today = dkey(a.now ? Number(a.now) : Date.now());
    let from = "", to = "";
    const mode = a.mode || (hr === 6 ? "week" : hr >= 8 && hr <= 21 ? "today" : "");
    if (mode === "today") { from = today; to = today; }
    else if (mode === "week") { from = today; for (let i = 0; i < 7; i++) from = dayBefore(from); to = dayBefore(today); }
    else return json({ skipped: "outside 6 AM and 8 AM–9 PM", hour: hr });
    const floor = /^\d{4}-\d{2}-\d{2}$/.test(cv.fc_auto_from || "") ? cv.fc_auto_from : "2026-11-01";
    if (from < floor) from = floor;
    if (to < from) return json({ skipped: "nothing after " + floor });
    const res: Record<string, unknown> = { mode, from, to };
    for (const c of COS) {
      if (!has(c)) { res[c] = "keys not saved"; continue; }
      const r = await handle(new Request(req.url, { method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": pushSecret },
        body: JSON.stringify({ action: "import", co: c, from, to, write: "true", auto: true }) }));
      let b: any = null; try { b = await r.json(); } catch (_) { b = { error: "no answer" }; }
      res[c] = b;
      if (r.status !== 200) {   // tell once a day, not every hour
        const { data: tr } = await adm.from("server_config").select("v").eq("k", "fc_told").maybeSingle();
        let told: string[] = []; try { told = JSON.parse(tr?.v || "[]"); } catch (_) { told = []; }
        const k = "autofail:" + c + ":" + today;
        if (!told.includes(k)) { told.push(k); await adm.from("server_config").upsert({ k: "fc_told", v: JSON.stringify(told.slice(-400)) }, { onConflict: "k" });
          await notifyFc("⚠️ The automatic Fingercheck import for " + CO_NAME[c] + " did not work (" + String(b?.error || r.status).slice(0, 120) + "). It tries again every hour.",
            "⚠️ La importación automática de Fingercheck para " + CO_NAME[c] + " no funcionó (" + String(b?.error || r.status).slice(0, 120) + "). Se intenta de nuevo cada hora.", { tab: "hours" }); }
      }
    }
    await adm.from("server_config").upsert({ k: "fc_auto_last", v: JSON.stringify({ at: new Date().toISOString(), mode, from, to,
      inc: (res.inc as any)?.punches ?? res.inc, usa: (res.usa as any)?.punches ?? res.usa }) }, { onConflict: "k" });
    return json(res);
  }
  if (!has(co) && action !== "hours") return json({ error: "Fingercheck keys are not saved for " + CO_NAME[co] }, 400);
  // read-only: the raw punches behind the time cards (to see exactly how Fingercheck stores them); private fields removed
  if (action === "raw") {
    const okD = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
    if (!okD(a.from) || !okD(a.to)) return json({ error: "from/to" }, 400);
    const emp = String(a.emp || "").replace(/[^0-9A-Za-z]/g, "");
    // Baruch 11/10 (approved): read-only look at paid hours (approved travel/expense amounts) and pay stubs too
    const what = ({ paidhours: "GetAllPaidHoursForDateRange", stubs: "GetEmployeePayStubsByDateRange", jobs: "" } as Record<string, string>)[String(a.what || "")];
    if (a.what === "jobs") { const r = await fc(co, "v1/Sync/GetJobList"); return json({ status: r.status, body: r.body }); }
    const r = what ? await fc(co, `v1/Reports/${what}${emp ? "ByEmployeeNumber" : ""}?startDate=${a.from}&endDate=${a.to}${emp ? "&employeeNumber=" + emp : ""}`)
      : await fc(co, emp ? `v1/Reports/GetAllTimeCardRawDataForDateRangeByEmployeeNumber?startDate=${a.from}&endDate=${a.to}&employeeNumber=${emp}`
      : `v1/Reports/GetAllTimeCardRawDataForDateRange?startDate=${a.from}&endDate=${a.to}`);
    const strip = (x: any): any => { if (Array.isArray(x)) return x.map(strip); if (x && typeof x === "object") { const o: any = {};
      for (const k of Object.keys(x)) if (!/ssn|social|tax|birth|dob|bank|account|routing|address|phone|email|salary|rate|wage/i.test(k)) o[k] = strip(x[k]); return o; } return x; };
    return json({ status: r.status, body: strip(r.body) });
  }
  // careful one-off punch fixes (Baruch 11/10, overnight shifts): {co, ops:[{kind: add|edit|delete, EmployeeNumber, PunchType,
  // TimePunch, Job?, PunchID?, ISExplicit?}]} — needs the sending switch (fc_write='on'); answers Fingercheck's reply per op
  if (action === "fix") {
    const { data: cfg } = await adm.from("server_config").select("v").eq("k", "fc_write").maybeSingle();
    if (cfg?.v !== "on") return json({ error: "Sending to Fingercheck is switched off" }, 403);
    const ops = Array.isArray(a.ops) ? a.ops.slice(0, 10) : []; const out: any[] = [];
    for (const o of ops) {
      const kind = String(o.kind || ""); const path = kind === "add" ? "v1/Punch/AddPunch" : kind === "edit" ? "v1/Punch/EditPunch" : kind === "delete" ? "v1/Punch/DeletePunch" : "";
      if (!path) { out.push({ error: "bad kind" }); continue; }
      const extra = o.extra && typeof o.extra === "object" ? o.extra : {};   // extra punch fields to try (e.g. the work date)
      const body = { ...extra, EmployeeNumber: String(o.EmployeeNumber || ""), PunchType: Number(o.PunchType) || 0, TimePunch: String(o.TimePunch || ""), Job: o.Job ?? null,
        PunchID: o.PunchID ?? null, ISExplicit: !!o.ISExplicit, Note: "Fixed in Electrix app" };
      const r = await fcWrite(co, kind === "delete" ? "DELETE" : "POST", path, body); out.push({ kind, ok: r.ok, status: r.status, body: r.body });
      if (!r.ok) break;
    }
    return json({ results: out });
  }
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
  if (action === "import") {
    // Baruch 11/8: bring past Fingercheck weeks into the app — time cards become punches (src 'fingercheck'),
    // paychecks become 'fcpay' (owner + Payroll only). Read from Fingercheck only; nothing is sent there.
    const okD = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
    const from = a.from, to = a.to;
    if (!okD(from) || !okD(to) || to < from || (Date.parse(to) - Date.parse(from)) > 31 * 86400000) return json({ error: "from/to: up to 31 days" }, 400);
    const write = String(a.write) === "true";
    const payOnly = a.only === "pay";   // Baruch 11/10: bring in paycheck travel by job only — never touches hours
    const { data: all } = await adm.from("records").select("id,data").eq("coll", "emps").eq("deleted", false);
    const { data: rr } = await adm.from("records").select("id,data").eq("coll", "rates").eq("deleted", false);
    const byNum: Record<string, string> = {};
    for (const r of rr || []) if (r.data?.fc && (!r.data.co || r.data.co === co)) byNum[String(r.data.fc)] = r.id;
    const emps2 = (all || []).filter((e: any) => e.data && e.data.role !== "owner" && e.data.role !== "office").map((e: any) => ({ id: e.id, n: norm(e.data.name || "") }));
    const byName = (first: string, last: string) => {
      const full = norm(first + " " + last), f = norm(first).split(" ")[0], l = norm(last).split(" ").pop() || "";
      const ex = emps2.filter((e) => e.n === full || e.n.replace(/ /g, "") === full.replace(/ /g, "")); if (ex.length === 1) return ex[0].id;
      const fl = emps2.filter((e) => { const t = e.n.split(" "); return t[0] === f && t.includes(l); }); return fl.length === 1 ? fl[0].id : null;
    };
    const whoOf = (num: string, first: string, last: string) => byNum[num] || byName(first, last);
    const { data: srows } = await adm.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
    const skey = (t: string) => { const w = String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter((x) => !["n", "s", "e", "w", "north", "south", "east", "west"].includes(x)); return w.length >= 2 && /^\d+$/.test(w[0]) ? w[0] + " " + w[1] : ""; };
    const sites: Record<string, string[]> = {};
    for (const s of srows || []) { const k = skey(s.data?.name || ""); if (k) (sites[k] ||= []).push(s.id); }
    const clean = (t: string) => String(t || "").replace(/['"\\<>`]/g, "").trim().slice(0, 90);
    const alias: Record<string, string> = {};   // Baruch 11/8: Fingercheck job names that are a job in the app under another name
    for (const s of srows || []) for (const al of (Array.isArray(s.data?.fcAlias) ? s.data.fcAlias : [])) alias[String(al)] = s.id;
    const siteOf = (jd: string) => { if (alias[jd]) return alias[jd]; const k = skey(jd); const c = k ? sites[k] : null; return c && c.length === 1 ? c[0] : (jd ? "fc:" + clean(jd) : null); };
    const at = (t: string) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(t || ""); return m ? nyAt(m[1], +m[2], +m[3]) : null; };
    // Baruch 11/10: read one day past the end too, so a shift that ends after midnight comes in with its punch-out
    // (Fingercheck's report only holds punches inside the dates asked for)
    const toPlus = dayAfter(to);
    const tc = await fc(co, `v1/Reports/GetAllTimeCardsForDateRange?startDate=${from}&endDate=${toPlus}`);
    if (tc.status !== 200) return json({ error: "Fingercheck time cards answered " + tc.status }, 502);
    const punches: any[] = [], unmapped: Record<string, number> = {}; let hours = 0, open = 0, matched = 0;
    const L0 = asList(tc.body).filter((x: any) => { const h = at(x.TimeIn); const wd = String(x.DateWorked || "").slice(0, 10) || (h ? dkey(h) : "");
      return !!h && wd <= to; });
    // Fingercheck sometimes files an after-midnight punch-out as a NEW punch-in on the next day. Find those: an open
    // punch-in from 12–6 AM right after the same person's open shift from the day before → put them together here
    // and tell Payroll, because Fingercheck itself still has it wrong.
    const overnight: any[] = [], splitIds = new Set<string>();
    const isOpen = (x: any) => !x.TimeOut;
    for (const b of L0) { if (!isOpen(b)) continue; const bi = at(b.TimeIn)!; const hr = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(bi))) % 24;
      if (hr >= 6) continue;
      const a0 = L0.find((x: any) => x !== b && String(x.EmployeeNumber) === String(b.EmployeeNumber) && isOpen(x) && at(x.TimeIn)! < bi && bi - at(x.TimeIn)! <= 20 * 3600000 && dkey(at(x.TimeIn)!) === dayBefore(dkey(bi)));
      if (!a0 || splitIds.has(String(a0.InPunchID))) continue;
      splitIds.add(String(b.InPunchID)); a0._splitOut = bi; a0._splitId = b.InPunchID;
      overnight.push({ name: clean((a0.FirstName || "") + " " + (a0.LastName || "")), day: dkey(at(a0.TimeIn)!), out: b.TimeIn }); }
    const newJobs: Record<string, number> = {};
    for (const x of L0) {
      if (splitIds.has(String(x.InPunchID))) continue;
      const hin = at(x.TimeIn), hout = x._splitOut || at(x.TimeOut); const num = String(x.EmployeeNumber || "");
      // Baruch 11/10: a punch-in with no punch-out from an earlier day comes in as "missing punch-out" (so Payroll can fix
      // that real entry); today's open punches (still working) and broken rows are skipped as before
      const missingOut = !!hin && !x.TimeOut && !x._splitOut && dkey(hin) < dkey(Date.now());
      if (!hin || (!missingOut && (!hout || hout <= hin))) { open++; continue; }
      const who = whoOf(num, x.FirstName || "", x.LastName || "");
      if (!who) { const nm = clean((x.FirstName || "") + " " + (x.LastName || "")); unmapped[nm] = Math.round(((unmapped[nm] || 0) + Number(x.Hours || 0)) * 100) / 100; continue; }
      const jd = clean(x.JobDescriptionPunch || ""); const site = siteOf(jd); if (site && !site.startsWith("fc:")) matched++;
      if (site && site.startsWith("fc:")) newJobs[jd] = (newJobs[jd] || 0) + 1;
      const id = "fc_" + String(x.InPunchID || (num + "_" + hin)).replace(/[^A-Za-z0-9_.:|@-]/g, "");
      const fh = x._splitOut ? (hout! - hin) / 3600000 : Number(x.Hours || 0);
      hours += fh;
      punches.push({ id, who, site, in: hin, out: missingOut ? null : hout, fcOpen: missingOut || undefined, src: "fingercheck", fcCo: co, fcNum: num, fcHours: Math.round(fh * 10000) / 10000, fcJob: jd || null, fcJobCode: x.JobPunch ? String(x.JobPunch) : undefined, fcInId: x.InPunchID || undefined, fcOutId: x.OutPunchID || undefined, fcSplitId: x._splitId || undefined, fcEdited: !!(x.IsInPunchEdit || x.IsOutPunchEdit) || undefined,
        fcSync: x._splitOut ? { state: "problem", at: Date.now(), by: "auto", err: "overnight shift: Fingercheck put the punch-out after midnight on the next day as a new punch-in — fix this one in Fingercheck" } : undefined });
    }
    const pd = await fc(co, `v1/Reports/GetAllPayrollCheckDetailsForDateRange?startDate=${from}&endDate=${to}`);
    if (pd.status !== 200) return json({ error: "Fingercheck paychecks answered " + pd.status }, 502);
    const checks: Record<string, any> = {}; let travel = 0;
    for (const row of asList(pd.body)) {
      const e = row.Employee || {}, d = row.PayrollCheckDetail || {}; const num = String(e.EmployeeNumber || "");
      const who = whoOf(num, e.FirstName || "", e.LastName || ""); if (!who) continue;
      const hid = String(d.CheckHeaderID || ""); if (!hid) continue;
      const c = (checks[hid] ||= { id: "fcpay_" + co + "_" + hid.replace(/[^A-Za-z0-9_-]/g, ""), who, fcNum: num, fcCo: co, checkDate: String(d.CheckDate || "").slice(0, 10),
        periodBegin: String(d.PeriodBegin || "").slice(0, 10), periodEnd: String(d.PeriodEnd || "").slice(0, 10), regH: 0, reg: 0, otH: 0, ot: 0, salary: 0, otherPay: 0, travel: 0, otherDed: 0, net: 0, taxes: 0 });
      const amt = Number(d.Amount || 0), h = Number(d.Hours || 0), code = String(d.Code || "").trim();
      if (d.RecordType === "E") { if (code === "RG") { c.regH += h; c.reg += amt; } else if (code === "OT") { c.otH += h; c.ot += amt; } else if (code === "SA") c.salary += amt; else c.otherPay += amt; }
      else if (d.RecordType === "D") { if (code === "TR") { c.travel += -amt; travel += -amt;
          // Baruch 11/10: keep which job each travel line was paid for (Reports → Job cost)
          const tjd = clean(d.JobDescription || ""), tk = String(d.JobCode || "") + "|" + tjd; const tl = (c.trJobs ||= []).find((z: any) => z.k === tk);
          if (tl) tl.amt += -amt; else c.trJobs.push({ k: tk, code: d.JobCode ? String(d.JobCode) : null, job: tjd || null, site: tjd ? siteOf(tjd) : null, amt: -amt }); }
        else c.otherDed += amt; }
      else if (d.RecordType === "T") { if (!/ER$/.test(code)) c.taxes += amt; }
      if (d.NetCheckAmount != null) c.net = Number(d.NetCheckAmount);
    }
    const pays = Object.values(checks).map((c: any) => { for (const f of ["regH", "reg", "otH", "ot", "salary", "otherPay", "travel", "otherDed", "taxes", "net"]) c[f] = Math.round(c[f] * 100) / 100;
      if (c.trJobs) c.trJobs = c.trJobs.map((z: any) => ({ code: z.code, job: z.job, site: z.site, amt: Math.round(z.amt * 100) / 100 }));
      c.gross = Math.round((c.reg + c.ot + c.salary + c.otherPay) * 100) / 100; return c; });
    const summary = { company: CO_NAME[co], from, to, punches: punches.length, hours: Math.round(hours * 100) / 100, jobsMatched: matched, openSkipped: open,
      unmapped, paychecks: pays.length, gross: Math.round(pays.reduce((q, c) => q + c.gross, 0) * 100) / 100, travel: Math.round(travel * 100) / 100, written: false,
      newJobs: Object.keys(newJobs), overnight, noMap: [] as string[] };
    // Baruch 11/10: jobs the crews worked that have no map point in the app — no GPS fence and no travel pay for them
    { const used = new Set(punches.map((p) => p.site).filter((x) => x && !String(x).startsWith("fc:")));
      for (const s of srows || []) if (used.has(s.id) && (s.data?.lat == null || s.data?.lng == null)) summary.noMap.push(clean(s.data?.name || s.id)); }
    if (write) {
      const now = new Date().toISOString();
      if (payOnly) punches.length = 0;
      // Baruch 11/10: never overwrite hours fixed in the app that were not sent to Fingercheck yet; keep the change log of
      // ones that were sent; and don't bring back a copy of a punch the app itself added to Fingercheck.
      const ids = punches.map((p) => p.id), keep: Record<string, any> = {}, skipIds = new Set<string>(); let protectedN = 0;
      for (let i = 0; i < ids.length; i += 300) {
        const { data: ex } = await adm.from("records").select("id,data").eq("coll", "punches").in("id", ids.slice(i, i + 300));
        for (const r of ex || []) keep[r.id] = r.data || {};
        const ins = punches.slice(i, i + 300).map((p) => p.fcInId).filter(Boolean);
        if (ins.length) { const { data: mine } = await adm.from("records").select("id,data").eq("coll", "punches").in("data->>fcInId", ins);
          for (const r of mine || []) if (!String(r.id).startsWith("fc_")) skipIds.add("fc_" + String(r.data?.fcInId || "").replace(/[^A-Za-z0-9_.:|@-]/g, "")); }
      }
      const opens = punches.filter((p) => p.fcOpen);
      if (opens.length) { const lo = Math.min(...opens.map((p) => p.in)) - 1200000, hi = Math.max(...opens.map((p) => p.in)) + 1200000;
        const { data: appP } = await adm.from("records").select("id,data").eq("coll", "punches").eq("deleted", false).gte("data->>in", String(lo)).lte("data->>in", String(hi));
        for (const o of opens) if ((appP || []).some((r: any) => !String(r.id).startsWith("fc_") && r.data?.who === o.who && !r.data?.voided && Math.abs(Number(r.data?.in) - o.in) <= 1200000)) skipIds.add(o.id); }
      const pend = (d: any) => d && ((d.fcSync && d.fcSync.state !== "sent") || (!d.fcSync && Array.isArray(d.edits) && d.edits.length) || (!d.fcSync && d.voided));
      const kept = punches.filter((p) => { if (skipIds.has(p.id)) return false; if (pend(keep[p.id])) { protectedN++; return false; } return true; })
        .map((p) => { const o = keep[p.id]; return o && o.fcSync ? { ...p, edits: o.edits, fcSync: p.fcSync || o.fcSync } : p; });
      (summary as any).protectedEdits = protectedN; (summary as any).linkedToApp = skipIds.size;
      punches.length = 0; punches.push(...kept);
      // automatic runs: write only what changed, so the hourly run doesn't rewrite (and re-log) every punch
      let pays2: any[] = pays;
      if (a.auto) {
        const same = (o: any, p: any) => o && ["who", "site", "in", "out", "fcOpen", "fcHours", "fcJob", "fcJobCode", "fcOutId", "fcEdited"].every((f) => JSON.stringify(o[f] ?? null) === JSON.stringify(p[f] ?? null)) && JSON.stringify(o.fcSync ?? null) === JSON.stringify(p.fcSync ?? null);
        const changed = punches.filter((p) => !same(keep[p.id], p)); (summary as any).unchanged = punches.length - changed.length;
        punches.length = 0; punches.push(...changed);
        const pids = pays.map((c: any) => c.id), old: Record<string, string> = {};
        for (let i = 0; i < pids.length; i += 300) { const { data: ex } = await adm.from("records").select("id,data").eq("coll", "fcpay").in("id", pids.slice(i, i + 300)); for (const r of ex || []) old[r.id] = JSON.stringify(r.data); }
        pays2 = pays.filter((c: any) => old[c.id] !== JSON.stringify(c));
        // a punch-in with no punch-out from an earlier day — tell once per shift
        const { data: toldRow0 } = await adm.from("server_config").select("v").eq("k", "fc_told").maybeSingle();
        let told0: string[] = []; try { told0 = JSON.parse(toldRow0?.v || "[]"); } catch (_) { told0 = []; }
        const miss = kept.filter((p) => p.fcOpen && !told0.includes("open:" + p.id));
        if (miss.length) { const nm: Record<string, string> = {}; for (const e of all || []) nm[e.id] = String(e.data?.name || e.id);
          const ls = miss.map((p) => (nm[p.who] || p.who) + " (" + dkey(p.in).slice(5) + ")").join(", ");
          await notifyFc("🕒 Missing punch-out in Fingercheck: " + ls + " — fix it in Fingercheck or in Time cards", "🕒 Falta la salida en Fingercheck: " + ls + " — corríjalo en Fingercheck o en Tarjetas de tiempo", { tab: "hours" });
          told0.push(...miss.map((p) => "open:" + p.id)); await adm.from("server_config").upsert({ k: "fc_told", v: JSON.stringify(told0.slice(-400)) }, { onConflict: "k" }); }
      }
      const rows = punches.map((p) => ({ coll: "punches", id: p.id, data: JSON.parse(JSON.stringify(p)), deleted: false, updated_by: "fingercheck", updated_at: now }))
        .concat(pays2.map((c: any) => ({ coll: "fcpay", id: c.id, data: c, deleted: false, updated_by: "fingercheck", updated_at: now })));
      for (let i = 0; i < rows.length; i += 400) {
        const { error } = await adm.from("records").upsert(rows.slice(i, i + 400), { onConflict: "coll,id" });
        if (error) return json({ ...summary, error: error.message, savedUpTo: i }, 500);
      }
      summary.written = true;
      // tell Baruch + Payroll — once per job / per shift, not on every import
      const { data: toldRow } = await adm.from("server_config").select("v").eq("k", "fc_told").maybeSingle();
      let told: string[] = []; try { told = JSON.parse(toldRow?.v || "[]"); } catch (_) { told = []; }
      const fresh = (k: string) => !told.includes(k) && (told.push(k), true);
      const jobsNew = payOnly ? [] : summary.newJobs.filter((j) => fresh("job:" + co + ":" + j));
      if (jobsNew.length) await notifyFc("🏗 Fingercheck has hours for a job that is not in the app: " + jobsNew.join(", ") + " — add it in Jobs",
        "🏗 Fingercheck tiene horas de un trabajo que no está en la app: " + jobsNew.join(", ") + " — agréguelo en Trabajos", { tab: "sites" });
      const noMapNew = payOnly ? [] : summary.noMap.filter((j) => fresh("map:" + j));
      if (noMapNew.length) await notifyFc("📍 No map point for " + noMapNew.join(", ") + " — GPS and travel pay can't be figured for it. Set the job's location.",
        "📍 Sin ubicación en el mapa para " + noMapNew.join(", ") + " — no se puede calcular GPS ni pago de viaje. Ponga la ubicación del trabajo.", { tab: "sites" });
      const onNew = payOnly ? [] : overnight.filter((o) => fresh("night:" + co + ":" + o.name + ":" + o.day));
      if (onNew.length) await notifyFc("🕒 Fingercheck put a punch-out after midnight on the next day as a new punch-in: " + onNew.map((o) => o.name + " (" + o.day.slice(5) + ")").join(", ") + " — fix it in Fingercheck",
        "🕒 Fingercheck puso una salida después de medianoche en el día siguiente como nueva entrada: " + onNew.map((o) => o.name + " (" + o.day.slice(5) + ")").join(", ") + " — corríjalo en Fingercheck", { tab: "hours" });
      if (jobsNew.length || noMapNew.length || onNew.length) await adm.from("server_config").upsert({ k: "fc_told", v: JSON.stringify(told.slice(-400)) }, { onConflict: "k" });
    }
    return json(summary);
  }
  if (action === "push") return await push();
  if (action === "travel") return await travelPush();
  return json({ error: "unknown action" }, 400);

  // ───────── travel: the travel the app counted → "Travel" (TR) lines in the coming Fingercheck payroll (Baruch 11/10) ─────────
  // {week: Sunday YYYY-MM-DD, who?: [emp ids], send?}. Without send=true it only previews. Sending needs fc_write='on' and a list
  // of people (the first run is one man; Shia checks his paycheck in Fingercheck before processing). One line per man per job,
  // the same kind of line an approved travel request makes. Weeks already paid with travel in Fingercheck are never sent again.
  async function travelPush() {
    const okD = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
    if (!okD(a.week)) return json({ error: "week (Sunday) needed" }, 400);
    const send = String(a.send) === "true"; const pick: string[] = Array.isArray(a.who) ? a.who.map(String) : [];
    const { data: cfg } = await adm.from("server_config").select("v").eq("k", "fc_write").maybeSingle(); const writeOn = cfg?.v === "on";
    if (send && !writeOn) return json({ error: "Sending to Fingercheck is switched off", writeOn }, 403);
    if (send && !pick.length && a.all !== true && a.remove !== true) return json({ error: "pick who to send" }, 400);
    const days: string[] = []; for (let i = 0; i < 7; i++) days.push(new Date(Date.parse(a.week + "T12:00:00Z") + i * 86400000).toISOString().slice(0, 10));
    const { data: trows } = await adm.from("records").select("id,data").eq("coll", "travel").eq("deleted", false).in("data->>date", days);
    const { data: rr } = await adm.from("records").select("id,data").eq("coll", "rates").eq("deleted", false);
    const numOf: Record<string, { fc: string; co: string }> = {};
    for (const r of rr || []) if (r.data?.fc) numOf[r.id] = { fc: String(r.data.fc), co: COS.includes(r.data.co) ? r.data.co : "inc" };
    const nameOf: Record<string, string> = {}; for (const e of emps || []) nameOf[e.id] = e.data?.name || e.id;
    const { data: paid } = await adm.from("records").select("data").eq("coll", "fcpay").eq("deleted", false).eq("data->>periodBegin", a.week);
    const paidWho = new Set((paid || []).filter((r: any) => Number(r.data?.travel) > 0).map((r: any) => r.data.who));
    const { data: srows } = await adm.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
    const sname: Record<string, string> = {}; for (const s of srows || []) sname[s.id] = s.data?.name || "";
    // Fingercheck job code of each job: from the hours brought in from Fingercheck (last 60 days)
    const codeOf: Record<string, string> = {};
    const { data: jp } = await adm.from("records").select("data").eq("coll", "punches").eq("deleted", false).gte("data->>in", String(Date.parse(a.week + "T12:00:00Z") - 60 * 86400000));
    for (const r of jp || []) { const d: any = r.data || {}; if (d.site && d.fcJobCode && !codeOf[d.site]) codeOf[d.site] = String(d.fcJobCode); }
    const T = (trows || []).map((r: any) => ({ ...(r.data || {}), id: r.id })).filter((x: any) => x.srv && x.status !== "ignored");
    const by: Record<string, any> = {};
    for (const x of T) {
      const it = (by[x.who] ||= { who: x.who, name: nameOf[x.who] || x.who, lines: {} as Record<string, any>, total: 0, sent: [] as any[], problem: null as string | null, notes: [] as string[] });
      if (x.fcSent) { it.sent.push({ id: x.id, date: x.date, amt: x.fcSent.amt, checkDate: x.fcSent.checkDate }); continue; }
      if (x.pay == null || x.status === "norate") { it.problem = "no pay rate in the app — add his rate first"; continue; }
      const k = x.site || "none"; const l = (it.lines[k] ||= { site: x.site, job: sname[x.site] || null, code: x.site ? (codeOf[x.site] || null) : null, amt: 0, legs: 0, days: [] as string[], ids: [] as string[] });
      l.amt += Number(x.pay) || 0; l.legs++; if (!l.days.includes(x.date)) l.days.push(x.date); l.ids.push(x.id); it.total += Number(x.pay) || 0;
    }
    const items = Object.values(by).map((it: any) => { const n = numOf[it.who]; it.co = n ? n.co : null;
      it.lines = Object.values(it.lines).map((l: any) => ({ ...l, amt: Math.round(l.amt * 100) / 100, days: l.days.sort() })); it.total = Math.round(it.total * 100) / 100;
      if (!n) it.problem = it.problem || "no Fingercheck number for this person";
      if (paidWho.has(it.who) && it.lines.length) it.problem = "travel for this week was already paid in Fingercheck";
      if (it.lines.some((l: any) => !l.code)) it.notes.push("a job has no Fingercheck job code yet — that line goes without a job");
      return it; }).filter((it: any) => it.lines.length || it.sent.length || it.problem).sort((x: any, y: any) => String(x.name).localeCompare(String(y.name)));
    // the coming payroll of each company (check date + run number)
    const payroll: Record<string, any> = {};
    for (const c of [...new Set(items.map((it: any) => it.co).filter(Boolean))] as string[]) {
      const r = await fc(c, "v1/payroll/GetUpcomingPayrolls"); const L = asList(r.body);
      // Baruch 11/11: Fingercheck lists coming payrolls as {Code:"11/16/2026" (check date), Description:"1" (run), StartDate, EndDate (pay period)}.
      // Travel goes into the payroll whose pay period is THIS week — never into another week's payroll.
      const mdy = (v: any) => { const m = String(v ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : ""; };
      const today = dkey(Date.now()); const pr = L.map((x: any) => ({ checkDate: String(x.CheckDate ?? x.checkDate ?? "").slice(0, 10) || mdy(x.Code), run: Number(x.RunNumber ?? x.runNumber ?? x.PayrollRunNumber ?? x.Run ?? x.Description ?? 1) || 1,
        begin: String(x.PeriodBegin ?? x.periodBegin ?? x.StartDate ?? "").slice(0, 10), end: String(x.PeriodEnd ?? x.periodEnd ?? x.EndDate ?? "").slice(0, 10), off: x.InActive === true }))
        .filter((x: any) => x.checkDate && !x.off).sort((x: any, y: any) => x.checkDate.localeCompare(y.checkDate));
      const hasPeriods = pr.some((x: any) => x.begin);
      const mine = hasPeriods ? pr.find((x: any) => x.begin === a.week) : pr.find((x: any) => x.checkDate >= today);
      payroll[c] = mine ? { checkDate: mine.checkDate, run: mine.run, begin: mine.begin, end: mine.end } : null;
      if (!mine) for (const it of items as any[]) if (it.co === c && it.lines.length) it.problem = it.problem || (hasPeriods ? "no payroll for this pay week in Fingercheck yet" : "no coming payroll found in Fingercheck");
    }
    // Baruch 11/11 (plan approved): travel as a one-paycheck "TR - Travel" line on each man's Fingercheck profile
    // (Employees → Deductions), dated for that paycheck only, marked "EXAPP <week>" so the app finds and removes only its own lines
    const prof = a.how === "profile";
    const ref = "EXAPP " + a.week;
    const okD2 = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x || "");
    const datesOf = (c: string) => { const pr = payroll[c]; if (!pr) return null;
      return { start: okD2(a.start) ? a.start : pr.checkDate, end: okD2(a.end) ? a.end : pr.checkDate }; };
    if (prof) {
      for (const it of items as any[]) {
        if (!it.co || !numOf[it.who]) continue;
        const d = await fc(it.co, "v1/Employees/GetEmployeeDeductionsByEmployeeNumber/" + encodeURIComponent(numOf[it.who].fc));
        const L = asList(d.body); it.profile = L.filter((x: any) => String(x.DeductionType || "").trim() === "TR").map((x: any) => ({ id: x.EmployeeDeductionID, amt: x.Amount, start: String(x.StartDate || "").slice(0, 10), end: String(x.EndDate || "").slice(0, 10), ref: x.PayeeReferenceNumber || "" }));
        if (d.status !== 200) it.problem = it.problem || "could not read his Fingercheck deductions (" + d.status + ")";
        else if (it.lines.length && it.profile.length) it.problem = it.problem || (it.profile.some((x: any) => x.ref === ref) ? "already on his profile for this week" : "he already has a Travel line on his profile — check it in Fingercheck first");
      }
      if (a.remove === true) return await trRemove(items as any[], numOf, ref, writeOn);
      for (const c in payroll) if (payroll[c]) payroll[c].dates = datesOf(c);
    }
    if (!send) return json({ preview: true, writeOn, week: a.week, payroll, items, how: prof ? "profile" : "payroll" });
    if (prof) {
      const go = (items as any[]).filter((it) => it.lines.length && !it.problem && (a.all === true || pick.includes(it.who)));
      const res: any[] = [];
      for (const it of go) {
        const dt = datesOf(it.co)!; const total = Math.round(it.lines.reduce((q: number, l: any) => q + l.amt, 0) * 100) / 100;
        const body = { EmployeeNumber: numOf[it.who].fc, DeductionType: "TR", DeductionDescription: "Travel", Rate: 0, Amount: -total,
          StartDate: dt.start + "T00:00:00", EndDate: dt.end + "T00:00:00", PayeeReferenceNumber: ref, CatchUpAllowed: false };
        const r = await fcWrite(it.co, "POST", "v1/Employees/AddEmployeeDeduction", body);
        // read it back — "saved" is only believed when the line is really on his profile
        const back = asList((await fc(it.co, "v1/Employees/GetEmployeeDeductionsByEmployeeNumber/" + encodeURIComponent(numOf[it.who].fc))).body)
          .find((x: any) => String(x.DeductionType || "").trim() === "TR" && (x.PayeeReferenceNumber || "") === ref);
        const ok = r.ok && !!back;
        res.push({ who: it.who, name: it.name, ok, total, dates: dt, dedId: back?.EmployeeDeductionID ?? null,
          err: ok ? null : r.ok ? "Fingercheck said saved, but the line is not on his profile" : "Fingercheck answered " + r.status + (typeof r.body === "string" ? ": " + r.body.slice(0, 160) : "") });
        if (ok) for (const l of it.lines) for (const id of l.ids) {
          const { data: cur } = await adm.from("records").select("data").eq("coll", "travel").eq("id", id).maybeSingle();
          await adm.from("records").update({ data: { ...(cur?.data || {}), fcSent: { checkDate: payroll[it.co].checkDate, run: payroll[it.co].run, at: Date.now(), by: me.id, amt: Number(cur?.data?.pay) || 0, job: l.code, how: "profile", dedId: back.EmployeeDeductionID, co: it.co } }, updated_at: new Date().toISOString(), updated_by: "fingercheck-send" }).eq("coll", "travel").eq("id", id);
        }
      }
      const bad = res.filter((x) => !x.ok);
      if (bad.length) await notifyFc("🚗 Fingercheck: travel did not go on the profile of " + bad.map((x) => x.name).join(", ") + ". Open Time cards to see why.",
        "🚗 Fingercheck: el viaje no entró en el perfil de " + bad.map((x) => x.name).join(", ") + ". Abra Tarjetas de tiempo para ver por qué.", { tab: "hours" });
      return json({ sent: true, how: "profile", payroll, results: res });
    }
    const go = (items as any[]).filter((it) => it.lines.length && !it.problem && (a.all === true || pick.includes(it.who)));
    const res: any[] = [];
    for (const c of [...new Set(go.map((it) => it.co))] as string[]) {
      const pr = payroll[c]; const mine = go.filter((it) => it.co === c);
      const body = mine.flatMap((it) => it.lines.map((l: any) => ({ EmployeeNumber: numOf[it.who].fc, PayNumber: 1, PayCode: "TR", RecordType: "D", Amount: -l.amt, Job: l.code,
        DateWorked: l.days[l.days.length - 1], StubMessage: "Travel " + (l.job || "") + " (Electrix app)" })));
      const r = await fcWrite(c, "POST", `v1/payroll/InsertPayroll?checkDate=${pr.checkDate}&runNumber=${pr.run}`, body);
      for (const it of mine) {
        res.push({ who: it.who, name: it.name, ok: r.ok, total: it.total, checkDate: pr.checkDate, err: r.ok ? null : "Fingercheck answered " + r.status + (typeof r.body === "string" ? ": " + r.body.slice(0, 160) : "") });
        if (r.ok) for (const l of it.lines) for (const id of l.ids) {
          const { data: cur } = await adm.from("records").select("data").eq("coll", "travel").eq("id", id).maybeSingle();
          await adm.from("records").update({ data: { ...(cur?.data || {}), fcSent: { checkDate: pr.checkDate, run: pr.run, at: Date.now(), by: me.id, amt: Number(cur?.data?.pay) || 0, job: l.code } }, updated_at: new Date().toISOString(), updated_by: "fingercheck-send" }).eq("coll", "travel").eq("id", id);
        }
      }
    }
    const bad = res.filter((x) => !x.ok);
    if (bad.length) await notifyFc("🚗 Fingercheck: travel did not go in for " + bad.map((x) => x.name).join(", ") + ". Open Time cards to see why.",
      "🚗 Fingercheck: el viaje no entró para " + bad.map((x) => x.name).join(", ") + ". Abra Tarjetas de tiempo para ver por qué.", { tab: "hours" });
    return json({ sent: true, payroll, results: res });
  }

  // after the paycheck is processed: take the app's own Travel lines off the profiles again (only lines marked "EXAPP <week>")
  // and compare what Fingercheck paid with what the app counted. Preview unless send=true.
  async function trRemove(items: any[], numOf: Record<string, { fc: string; co: string }>, ref: string, writeOn: boolean) {
    const send = String(a.send) === "true";
    if (send && !writeOn) return json({ error: "Sending to Fingercheck is switched off", writeOn }, 403);
    const { data: paid } = await adm.from("records").select("data").eq("coll", "fcpay").eq("deleted", false).eq("data->>periodBegin", a.week);
    const paidBy: Record<string, number> = {}; for (const r of paid || []) paidBy[r.data.who] = Math.round(((paidBy[r.data.who] || 0) + Number(r.data.travel || 0)) * 100) / 100;
    const out: any[] = [];
    const pick: string[] = Array.isArray(a.who) ? a.who.map(String) : [];
    for (const it of items) {
      if (pick.length && !pick.includes(it.who)) continue;
      const mine = (it.profile || []).filter((x: any) => x.ref === ref); if (!mine.length && !it.sent.length) continue;
      const app = Math.round(it.sent.reduce((q: number, x: any) => q + (Number(x.amt) || 0), 0) * 100) / 100;
      const row: any = { who: it.who, name: it.name, lines: mine, appTravel: app, fcPaid: paid?.length ? (paidBy[it.who] ?? 0) : null, removed: [] as any[] };
      row.match = row.fcPaid == null ? null : Math.abs(row.fcPaid - app) < 0.01;
      if (send && mine.length) {
        if (row.fcPaid == null && a.force !== true) row.err = "the paycheck is not processed yet (bring in the paychecks first) — not removed";
        else for (const x of mine) {
          const r = await fcWrite(it.co, "DELETE", "v1/Employees/DeleteEmployeeDeductions", { EmployeeNumber: numOf[it.who].fc, EmployeeDeductionID: x.id, DeductionType: "TR", DeductionDescription: "Travel", Rate: 0, Amount: x.amt, StartDate: x.start + "T00:00:00", EndDate: x.end + "T00:00:00", PayeeReferenceNumber: ref, CatchUpAllowed: false });
          row.removed.push({ id: x.id, ok: r.ok, status: r.status });
        }
      }
      out.push(row);
    }
    const off = out.filter((r) => r.match === false);
    if (send && off.length) await notifyFc("🚗 Travel paid in Fingercheck is different from the app for " + off.map((r) => r.name + " ($" + r.fcPaid + " vs $" + r.appTravel + ")").join(", "),
      "🚗 El viaje pagado en Fingercheck es diferente de la app para " + off.map((r) => r.name + " ($" + r.fcPaid + " vs $" + r.appTravel + ")").join(", "), { tab: "hours" });
    return json({ remove: true, preview: !send, week: a.week, ref, people: out });
  }

  // ───────── push: hours fixed in the app → Fingercheck (preview unless send=true and the server switch is on) ─────────
  async function push() {
    const send = String(a.send) === "true";
    const ids: string[] = Array.isArray(a.ids) ? a.ids.slice(0, 150).map(String) : [];
    if (!ids.length) return json({ error: "nothing to send" }, 400);
    const { data: cfg } = await adm.from("server_config").select("v").eq("k", "fc_write").maybeSingle();
    const writeOn = cfg?.v === "on";
    if (send && !writeOn) return json({ error: "Sending to Fingercheck is switched off", writeOn }, 403);
    const { data: prow } = await adm.from("records").select("id,data").eq("coll", "punches").in("id", ids);
    const { data: rr } = await adm.from("records").select("id,data").eq("coll", "rates").eq("deleted", false);
    const numOf: Record<string, { fc: string; co: string }> = {};
    for (const r of rr || []) if (r.data?.fc) numOf[r.id] = { fc: String(r.data.fc), co: COS.includes(r.data.co) ? r.data.co : "inc" };
    const nameOf: Record<string, string> = {}; for (const e of emps || []) nameOf[e.id] = e.data?.name || e.id;
    const P = (prow || []).map((r: any) => ({ ...(r.data || {}), id: r.id }));
    for (const p of P) if (!numOf[p.who] && p.fcNum) numOf[p.who] = { fc: String(p.fcNum), co: COS.includes(p.fcCo) ? p.fcCo : "inc" };
    // fresh Fingercheck time cards for the days involved (and the 30 days before, to know each job's Fingercheck code)
    const days = P.flatMap((p: any) => [p.in, p.edits && p.edits[0] && p.edits[0].from && p.edits[0].from.in].filter(Boolean)).map((t: number) => dkey(t)).sort();
    if (!days.length) return json({ error: "nothing to send" }, 400);
    const last = days[days.length - 1], first = days[0];
    if (Date.parse(last) - Date.parse(first) > 30 * 86400000) return json({ error: "send one month at a time" }, 400);
    const from = dkey(Math.min(Date.parse(first + "T12:00:00Z"), Date.parse(last + "T12:00:00Z") - 30 * 86400000));
    const cos = [...new Set(P.map((p: any) => (numOf[p.who] || { co: "inc" }).co))];
    const rows: Record<string, any[]> = {};
    for (const c of cos) { if (!has(c)) return json({ error: "Fingercheck keys are not saved for " + CO_NAME[c] }, 400);
      const r = await fc(c, `v1/Reports/GetAllTimeCardsForDateRange?startDate=${from}&endDate=${dayAfter(last)}`);
      if (r.status !== 200) return json({ error: "Fingercheck time cards answered " + r.status }, 502); rows[c] = asList(r.body); }
    const at = (t: string) => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(t || ""); return m ? nyAt(m[1], +m[2], +m[3]) : null; };
    const { data: srows } = await adm.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
    const skey = (t: string) => { const w = String(t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter((x) => !["n", "s", "e", "w", "north", "south", "east", "west"].includes(x)); return w.length >= 2 && /^\d+$/.test(w[0]) ? w[0] + " " + w[1] : ""; };
    const sites: Record<string, string[]> = {}; const alias: Record<string, string> = {}; const sname: Record<string, string> = {};
    for (const s of srows || []) { sname[s.id] = s.data?.name || ""; const k = skey(s.data?.name || ""); if (k) (sites[k] ||= []).push(s.id);
      for (const al of (Array.isArray(s.data?.fcAlias) ? s.data.fcAlias : [])) alias[String(al)] = s.id; }
    const siteOfDesc = (jd: string) => { const c0 = String(jd || "").replace(/['"\\<>`]/g, "").trim(); if (alias[c0]) return alias[c0]; const k = skey(c0); const c = k ? sites[k] : null; return c && c.length === 1 ? c[0] : null; };
    const byIn: Record<string, any> = {}; const codeOfSite: Record<string, string> = {};
    for (const c of cos) for (const x of rows[c]) { if (x.InPunchID) byIn[String(x.InPunchID)] = { ...x, _co: c };
      if (x.JobPunch) { const sid = siteOfDesc(x.JobDescriptionPunch || ""); if (sid && !codeOfSite[sid]) codeOfSite[sid] = String(x.JobPunch); } }
    for (const p of P) if (p.site && p.fcJobCode && !codeOfSite[p.site]) codeOfSite[p.site] = String(p.fcJobCode);
    const nyIso = (ms: number) => { const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
      const g = (k: string) => (f.find((x) => x.type === k) || { value: "00" }).value; const hh = g("hour") === "24" ? "00" : g("hour");
      const local = Date.UTC(+g("year"), +g("month") - 1, +g("day"), +hh, +g("minute"), +g("second")); const off = Math.round((local - ms) / 60000);
      const sg = off < 0 ? "-" : "+"; const ao = Math.abs(off); return `${g("year")}-${g("month")}-${g("day")}T${hh}:${g("minute")}:00${sg}${String(Math.floor(ao / 60)).padStart(2, "0")}:${String(ao % 60).padStart(2, "0")}`; };
    const items: any[] = [];
    for (const p of P) {
      const it: any = { id: p.id, who: p.who, name: nameOf[p.who] || p.who, day: dkey(p.in), ops: [] as any[], problem: null as string | null };
      items.push(it);
      if (p.fcSync && (p.fcSync.state === "problem" || p.fcSync.state === "error") && p.fcSync.err) it.lastErr = String(p.fcSync.err).slice(0, 300);
      const n = numOf[p.who]; if (!n) { it.problem = "no Fingercheck number for this person"; continue; }
      it.co = n.co; const base = (type: number, t: number, job: string | null, pid: string | null) => ({ EmployeeNumber: n.fc, PunchType: type, TimePunch: nyIso(t), Job: job, PunchID: pid, Note: "Fixed in Electrix app" });
      const fcIn = p.src === "fingercheck" ? (p.fcInId || String(p.id).replace(/^fc_/, "")) : (p.fcInId || null);
      let row = fcIn ? byIn[fcIn] : null; let adopt = false;
      if (!fcIn && !p.voided) { const L2 = (rows[n.co] || []).filter((x: any) => String(x.EmployeeNumber) === n.fc && !x.TimeOut && x.InPunchID && Math.abs((at(x.TimeIn) || 0) - p.in) <= 1200000);
        if (L2.length === 1) { row = L2[0]; adopt = true; it.adopt = true; it.note = "Fingercheck already has this punch-in with no punch-out — only the punch-out is sent"; } }
      const job = p.site ? (codeOfSite[p.site] || null) : null;
      it.before = row ? { in: at(row.TimeIn), out: at(row.TimeOut), job: row.JobDescriptionPunch || null } : null;
      it.after = p.voided ? null : { in: p.in, out: p.out || null, job: sname[p.site] || null };
      if (fcIn && !row) { if (p.voided) { it.done = "already gone in Fingercheck"; continue; } it.problem = "this punch is not in Fingercheck anymore — it was changed or removed there"; continue; }
      if (row && row.EmployeeNumber != null && String(row.EmployeeNumber) !== n.fc) { it.problem = "the person was changed — fix this one in Fingercheck"; continue; }
      if (row && !adopt) { const orig = p.edits && p.edits[0] && p.edits[0].from; const fin = at(row.TimeIn), fout = at(row.TimeOut);
        const same = (x: number | null, y: number | null) => (x == null && y == null) || (x != null && y != null && Math.abs(x - y) < 60000);
        if (orig && !(same(fin, orig.in) && same(fout, orig.out ?? null)) && !(same(fin, p.in) && same(fout, p.out || null)))
          { it.problem = "it was also changed in Fingercheck meanwhile — fix this one in Fingercheck"; continue; } }
      if (p.site && !job && !p.voided && !adopt) it.note = "this job has no Fingercheck job code yet — sent without a job";
      // Baruch 11/10: before sending, look for OTHER Fingercheck punches of this person inside these hours (or a stray
      // punch-in right at the punch-out, which is how Fingercheck files a bad overnight punch-out) — stop and say so
      if (!p.voided) { const lo = p.in, hi = p.out || p.in; const mine = new Set(P.map((q: any) => String(q.fcInId || (q.src === "fingercheck" ? String(q.id).replace(/^fc_/, "") : ""))).filter(Boolean));
        const clash = (rows[n.co] || []).find((x: any) => { if (String(x.EmployeeNumber) !== n.fc || (row && x.InPunchID === row.InPunchID) || mine.has(String(x.InPunchID))) return false;
          const xi = at(x.TimeIn), xo = at(x.TimeOut); if (xi == null) return false;
          if (xo == null) return (xi > lo + 60000 && xi < hi - 60000) || (p.out != null && Math.abs(xi - p.out) <= 1200000) || Math.abs(xi - p.in) <= 1200000;
          return Math.min(xo, hi) - Math.max(xi, lo) > 60000; });
        if (clash) { const hm = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
          it.problem = "Fingercheck has another punch for this person at " + hm(at(clash.TimeIn)!) + (clash.TimeOut ? "–" + hm(at(clash.TimeOut)!) : " (no punch-out)") + " — remove or fix that one in Fingercheck first";
          it.clash = { in: at(clash.TimeIn), out: at(clash.TimeOut) }; continue; } }
      const overnightOut = !!p.out && dkey(p.out) !== dkey(p.in);
      if (p.voided) { if (row) { it.ops.push({ kind: "delete", what: "in", body: base(0, at(row.TimeIn)!, row.JobPunch || null, String(row.InPunchID)) });
          if (row.OutPunchID) it.ops.push({ kind: "delete", what: "out", body: base(1, at(row.TimeOut)!, row.JobPunch || null, String(row.OutPunchID)) }); }
        continue; }
      if (!row) { it.ops.push({ kind: "add", what: "in", body: base(0, p.in, job, null) }); if (p.out) it.ops.push({ kind: "add", what: "out", body: dkey(p.out) !== dkey(p.in) ? { ...base(1, p.out, job, null), ISExplicit: true } : base(1, p.out, job, null) }); continue; }
      const jobNow = job || (row.JobPunch ? String(row.JobPunch) : null); const jobChanged = !!job && String(row.JobPunch || "") !== job;
      const fin = at(row.TimeIn), fout = at(row.TimeOut);
      // (an adopted open punch keeps Fingercheck's own punch-in unless it is more than 5 minutes off)
      if (jobChanged || fin == null || Math.abs(fin - p.in) >= (adopt ? 300000 : 60000)) it.ops.push({ kind: "edit", what: "in", body: base(0, p.in, jobNow, String(row.InPunchID)) });
      if (p.out) { if (row.OutPunchID) { if (jobChanged || fout == null || Math.abs(fout - p.out) >= 60000) {
            // an edit never moves a punch to another day in Fingercheck, so an after-midnight punch-out is taken out and put in fresh
            if (overnightOut || (fout != null && dkey(fout) !== dkey(p.out))) { it.ops.push({ kind: "delete", what: "out", body: base(1, fout ?? p.out, row.JobPunch ? String(row.JobPunch) : null, String(row.OutPunchID)) });
              it.ops.push({ kind: "add", what: "out", body: { ...base(1, p.out, jobNow, null), ISExplicit: true } }); }
            else it.ops.push({ kind: "edit", what: "out", body: base(1, p.out, jobNow, String(row.OutPunchID)) }); } }
        else it.ops.push({ kind: "add", what: "out", body: overnightOut ? { ...base(1, p.out, jobNow, null), ISExplicit: true } : base(1, p.out, jobNow, null) }); }
      else if (row.OutPunchID) { it.problem = "a punch-out can't be taken away here — fix this one in Fingercheck"; it.ops = []; continue; }
      if (!it.ops.length) it.done = "already the same in Fingercheck";
    }
    for (const it of items) { const p = P.find((x: any) => x.id === it.id); if (p && p.out && !p.voided && dkey(p.out) !== dkey(p.in) && !it.problem)
      it.note = (it.note ? it.note + " · " : "") + "ends after midnight — it goes on " + dkey(p.in) + " in Fingercheck"; }
    if (!send) return json({ preview: true, writeOn, items: items.map((x) => ({ ...x, ops: x.ops.map((o: any) => ({ kind: o.kind, what: o.what, time: o.body.TimePunch, job: o.body.Job })) })) });
    // send, one punch at a time; stop that punch at its first refusal
    const nowIso = new Date().toISOString(); const res: any[] = [];
    for (const it of items) {
      const p = P.find((x: any) => x.id === it.id); let err: string | null = it.problem; const done: any[] = [];
      if (!err) for (const o of it.ops) {
        const path = o.kind === "add" ? "v1/Punch/AddPunch" : o.kind === "edit" ? "v1/Punch/EditPunch" : "v1/Punch/DeletePunch";
        const r = await fcWrite(it.co, o.kind === "delete" ? "DELETE" : "POST", path, o.body);
        done.push({ kind: o.kind, what: o.what, status: r.status, ok: r.ok }); if (!r.ok) { err = "Fingercheck answered " + r.status + (typeof r.body === "string" ? ": " + r.body.slice(0, 120) : ""); break; }
      }
      const fcSync = err ? { state: it.problem ? "problem" : "error", at: Date.now(), by: me.id, err, done } : { state: "sent", at: Date.now(), by: me.id, done };
      await adm.from("records").update({ data: { ...p, id: undefined, fcSync }, updated_at: nowIso, updated_by: "fingercheck-send" }).eq("coll", "punches").eq("id", it.id);
      res.push({ id: it.id, name: it.name, day: it.day, ok: !err, err, done });
    }
    // added punches: find their new Fingercheck ids so a later import doesn't bring a second copy
    const added = items.filter((it) => res.find((r) => r.id === it.id && r.ok) && (it.adopt || it.ops.some((o: any) => o.kind === "add" && o.what === "in")));
    if (added.length) for (const c of [...new Set(added.map((x) => x.co))]) {
      const ds = added.filter((x) => x.co === c).map((x) => x.day).sort();
      const r = await fc(c, `v1/Reports/GetAllTimeCardsForDateRange?startDate=${ds[0]}&endDate=${dayAfter(ds[ds.length - 1])}`); const L = asList(r.body);
      for (const it of added.filter((x) => x.co === c)) { const p = P.find((x: any) => x.id === it.id); const n = numOf[p.who];
        const m = L.find((x: any) => String(x.EmployeeNumber) === n.fc && Math.abs((at(x.TimeIn) || 0) - p.in) < (it.adopt ? 1200000 : 60000));
        if (m) { const { data: cur } = await adm.from("records").select("data").eq("coll", "punches").eq("id", it.id).maybeSingle();
          const keepIn = it.adopt && at(m.TimeIn) ? { in: at(m.TimeIn) } : {};
          await adm.from("records").update({ data: { ...(cur?.data || {}), ...keepIn, fcInId: m.InPunchID || undefined, fcOutId: m.OutPunchID || undefined, fcNum: n.fc, fcCo: c }, updated_at: new Date().toISOString(), updated_by: "fingercheck-send" }).eq("coll", "punches").eq("id", it.id); } }
    }
    // Baruch 11/10: read Fingercheck back and compare every sent punch with the app — day, times and hours.
    // Anything that doesn't match is marked as a problem on that punch and Baruch + Payroll get a notice.
    const bad: any[] = [];
    const sentOk = items.filter((it) => res.find((r) => r.id === it.id && r.ok) && it.ops.length);
    if (sentOk.length) for (const c of [...new Set(sentOk.map((x) => x.co))]) {
      const mine = sentOk.filter((x) => x.co === c); const ds = mine.map((x) => x.day).sort();
      let tries = 0, left = mine;
      while (left.length && tries < 3) {
        await new Promise((z) => setTimeout(z, tries ? 5000 : 2500)); tries++;   // Fingercheck's report takes a few seconds to show new punches
        const r = await fc(c, `v1/Reports/GetAllTimeCardsForDateRange?startDate=${ds[0]}&endDate=${dayAfter(ds[ds.length - 1])}`); if (r.status !== 200) break;
        const L = asList(r.body); const next: any[] = [];
        for (const it of left) { const p = P.find((x: any) => x.id === it.id); const n = numOf[p.who];
          const { data: cur } = await adm.from("records").select("data").eq("coll", "punches").eq("id", it.id).maybeSingle(); const q = { ...p, ...(cur?.data || {}) };
          const m = L.filter((x: any) => String(x.EmployeeNumber) === n.fc && Math.abs((at(x.TimeIn) || 0) - q.in) < 60000);
          let why: string | null = null;
          if (q.voided) { if (m.length) why = "it is still in Fingercheck"; }
          else if (!m.length) why = "Fingercheck doesn't show this punch-in";
          else { const x = m[0]; const fout = at(x.TimeOut); const wd = String(x.DateWorked || "").slice(0, 10);
            if (wd && wd !== dkey(q.in)) why = "Fingercheck put it on " + wd + " instead of " + dkey(q.in);
            else if (q.out && (fout == null || Math.abs(fout - q.out) >= 60000)) why = "the punch-out in Fingercheck is " + (fout ? String(x.TimeOut).slice(0, 16).replace("T", " ") : "missing");
            else if (!q.out && fout != null) why = "Fingercheck has a punch-out the app doesn't";
            else if (q.out && Math.abs(Number(x.Hours || 0) - (q.out - q.in) / 3600000) > 0.05) why = "Fingercheck counts " + Number(x.Hours || 0).toFixed(2) + " h, the app " + ((q.out - q.in) / 3600000).toFixed(2) + " h";
            if (!why && m.length > 1) why = "Fingercheck has this punch twice"; }
          if (why) next.push({ it, why }); }
        left = next.map((z) => z.it); if (!left.length || tries >= 3) for (const z of next) bad.push(z);
      }
    }
    for (const z of bad) { const r0 = res.find((r) => r.id === z.it.id); if (r0) { r0.ok = false; r0.err = "checked after sending: " + z.why; }
      const { data: cur } = await adm.from("records").select("data").eq("coll", "punches").eq("id", z.it.id).maybeSingle();
      await adm.from("records").update({ data: { ...(cur?.data || {}), fcSync: { state: "problem", at: Date.now(), by: me.id, err: "checked after sending: " + z.why + " — fix this one in Fingercheck" } }, updated_at: new Date().toISOString(), updated_by: "fingercheck-send" }).eq("coll", "punches").eq("id", z.it.id); }
    const failed = res.filter((r) => !r.ok);
    if (failed.length) { const ls = failed.slice(0, 6).map((r) => r.name + " " + String(r.day).slice(5)).join(", ") + (failed.length > 6 ? " +" + (failed.length - 6) : "");
      await notifyFc("🕒 Fingercheck: " + failed.length + " punch" + (failed.length > 1 ? "es" : "") + " did not go in right — " + ls + ". Open Time cards to see why.",
        "🕒 Fingercheck: " + failed.length + " marcaje" + (failed.length > 1 ? "s" : "") + " no entró bien — " + ls + ". Abra Tarjetas de tiempo para ver por qué.", { tab: "hours" }); }
    return json({ sent: true, checked: sentOk.length, results: res });
  }
};
Deno.serve(handle);
