// Supabase Edge Function "owntracks" — automatic time clock (Baruch 11/11).
// The free OwnTracks phone app watches each man's Electrix job areas by itself (even with every app closed) and POSTs here
// when he arrives at or leaves a job. Login: HTTP Basic, user = Electrix person id, password = his own token (ot_setup).
// What is kept: only "arrived at / left" an Electrix job, and the last time his phone was seen inside the job he is clocked
// in at. Every other location the phone sends is thrown away.
//   leave the job he is clocked in at  → away = time he left (the server closes the clock there if he isn't back within 1 h)
//   back at that job within 1 h         → the time away stays on the clock (material run), as the app does
//   arrive at ANOTHER job               → only after he has been there 5 minutes (Baruch: driving past a job must not switch):
//                                          on the clock → switch (the old job ends when he left it, so the drive goes to the new
//                                          job); not on the clock (6 AM–7 PM) → one "punch in" reminder
//   a "job not in the app" he punched in at is watched right away (its GPS point, 150 m)
//   (11/12) every location the phone sends is also checked against ALL jobs in the app (the phone itself can watch only 20):
//   standing inside any job's fence for 5 minutes counts as arriving there, the same as above
//   phone far outside the job he is clocked in at, and no "left" came (a job the phone wasn't watching yet) → away from then
// The answer to every message tells the phone which jobs to watch (up to 20: the job he's on, today's schedule, his jobs
// of the last 3 weeks). A timer (cron, x-push-secret) calls {"tick":true} every minute to act on 5-minute arrivals.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "America/New_York";
const DWELL = 5 * 60000;
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const dkey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const hourNY = (ms: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(ms))) % 24;
const hm = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const distM = (a: number, b: number, c: number, d: number) => { const R = 6371000, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const short = (n: string) => String(n || "").replace(/,?\s*NY\s*\d{5}.*$/i, "").replace(/,?\s*NJ\s*\d{5}.*$/i, "").trim();
// Baruch 11/19 (Lennin, Bethune Blvd): the tracker uses only jobs that are in the app. A lost bid (copied from Trello's
// "Lost Bids" list, hidden in the app) is never a job — standing next to one does nothing. Finished jobs are skipped too.
const inApp = (J: any) => !!J && J.stage !== "lost" && J.stage !== "done";
const radM = (s: any) => Math.max(100, (Number(s?.rad) || 300) * 0.3048);   // the app keeps the fence in feet; phones need ≥ ~100 m

// Baruch 11/18: the jobs on a man's schedule for a day — his crew's day booking (an explicit day overrides the ongoing job),
// else the crew's ongoing job (unless cancelled/replaced that day) plus that day's extra bookings, plus jobs he alone was
// sent to (loans "L:<who>|<day>"). Same rules as the app's effectiveAsgs().
const STALE = 10 * 60000;   // a "punch in" reminder only goes out when the phone's latest reading is this fresh
// Baruch 11/19: a late report is NOT thrown away for being late — what decides is whether it is NEW. Every location reading
// newer than the newest one already handled is used, with its own phone time (a phone that was quiet for an hour and then
// sends a burst: each reading counts, in order). A reading we already had (Android re-sends its last fix again and again)
// is a repeat and is dropped. Readings from another day, or more than 12 hours old, are dropped.
const MAXAGE = 12 * 3600000;
async function schedSites(adm: any, emp: any, user: string, day: string): Promise<Set<string>> {
  const out = new Set<string>(); const add = (s: any) => { if (s) out.add(String(s)); };
  const dow = new Date(day + "T12:00:00Z").getUTCDay();
  if (emp.crew) {
    const { data: dr } = await adm.from("records").select("id,data").eq("coll", "sched").eq("id", emp.crew + "|" + day).eq("deleted", false).maybeSingle();
    const { data: rows } = await adm.from("records").select("id,data").eq("coll", "sched").eq("deleted", false).like("id", "ONG:" + emp.crew + ":%");
    const row: any = dr?.data || null;
    const isPatch = !!(row && (row.cancel || row.replace || row.patch));
    if (row && !isPatch && (Array.isArray(row.assignments) || row.site)) { add(row.site); for (const a of row.assignments || []) add(a && a.site); }
    else {
      const rules = (rows || []).filter((r: any) => String(r.id).startsWith("ONG:")).map((r: any) => r.data || {})
        .filter((r: any) => r.site && (!r.from || day >= r.from) && (!r.to || day <= r.to) && (r.workdays || [1, 2, 3, 4, 5]).includes(dow))
        .sort((a: any, b: any) => String(b.from || "").localeCompare(String(a.from || "")));
      if (rules[0] && !((row && row.cancel) || []).includes("ONG")) { const rep = ((row && row.replace) || {})["ONG"]; add(rep ? rep.site : rules[0].site); }
      for (const a of (row && Array.isArray(row.assignments) ? row.assignments : [])) add(a && a.site);
    }
  }
  const { data: ln } = await adm.from("records").select("data").eq("coll", "sched").eq("id", "L:" + user + "|" + day).eq("deleted", false).maybeSingle();
  for (const a of (ln?.data && Array.isArray(ln.data.assignments) ? ln.data.assignments : [])) add(a && a.site);
  return out;
}

// Baruch 11/19: his earliest booked start that day in minutes (his own booking, else his crew's day booking); 480 = 8:00 when
// nothing earlier is booked — a day booked for 6:30 opens the 5-minute window at 5:30
async function schedStart(adm: any, emp: any, user: string, day: string): Promise<number> {
  let m = 480; const take = (L: any) => { for (const a of (Array.isArray(L) ? L : [])) { const v = Number(a && a.site ? a.start : NaN); if (Number.isFinite(v) && v < m) m = v; } };
  const { data: ln } = await adm.from("records").select("data").eq("coll", "sched").eq("id", "L:" + user + "|" + day).eq("deleted", false).maybeSingle();
  take(ln?.data?.assignments);
  if (emp.crew) { const { data: dr } = await adm.from("records").select("data").eq("coll", "sched").eq("id", emp.crew + "|" + day).eq("deleted", false).maybeSingle(); take(dr?.data?.assignments); }
  return m;
}

// Baruch 11/20 "Go home at": the end the boss set on a booking (assignment.home = true) — his own booking first, else his
// crew's day booking (only when he has no booking of his own). null = the normal end. Same rule as private.man_sched_end.
async function schedEnd(adm: any, emp: any, user: string, day: string): Promise<number | null> {
  const take = (L: any) => { let m: number | null = null; for (const a of (Array.isArray(L) ? L : [])) { const v = Number(a && a.site && a.home === true ? a.end : NaN); if (Number.isFinite(v) && (m == null || v > m)) m = v; } return m; };
  const { data: ln } = await adm.from("records").select("data").eq("coll", "sched").eq("id", "L:" + user + "|" + day).eq("deleted", false).maybeSingle();
  if (ln?.data) return take(ln.data.assignments);
  if (!emp.crew) return null;
  const { data: dr } = await adm.from("records").select("data").eq("coll", "sched").eq("id", emp.crew + "|" + day).eq("deleted", false).maybeSingle();
  return take(dr?.data?.assignments);
}

// where a punch is: a job in the app, or (Baruch 11/11) a "job not in the app" at the GPS point he punched in at
const placeOf = (d: any, site: Record<string, any>) => d.site && site[d.site] ? { key: d.site, lat: site[d.site].lat, lng: site[d.site].lng, rad: radM(site[d.site]), name: site[d.site].name }
  : d.newJob && d.newJob.lat != null ? { key: null, lat: d.newJob.lat, lng: d.newJob.lng, rad: 150, name: d.newJob.text || "the job" } : null;
async function load(adm: any, user: string, now: number) {
  const { data: er } = await adm.from("records").select("id,data").eq("coll", "emps").eq("id", user).maybeSingle();
  const emp = er?.data || {};
  // 11/14 (speed): only the five fields this function uses — not every job's notes, files and links on every report
  const { data: srows } = await adm.from("records").select("id,name:data->name,lat:data->lat,lng:data->lng,rad:data->rad,stage:data->stage").eq("coll", "sites").eq("deleted", false);
  const site: Record<string, any> = {}; for (const s of srows || []) site[s.id] = { name: s.name ?? undefined, lat: s.lat ?? undefined, lng: s.lng ?? undefined, rad: s.rad ?? undefined, stage: s.stage ?? undefined };
  const { data: pr } = await adm.from("records").select("id,data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 20 * 3600000));
  // Baruch 11/19 (bug 6): a clock-in waiting for approval (pending) counts as on the clock; a rejected one does not
  const open = (pr || []).map((r: any) => ({ id: r.id, d: r.data || {} }))
    .filter((x: any) => x.d.out == null && !x.d.voided && !x.d.rejected && x.d.src !== "fingercheck").sort((a: any, b: any) => Number(b.d.in) - Number(a.d.in))[0] || null;
  // Baruch 11/19: a clock-in that is waiting for the office to approve counts as punched in — no "punch in" reminders
  const waiting = (pr || []).some((r: any) => { const d = r.data || {}; return d.out == null && !d.voided && d.pending && !d.rejected && d.src !== "fingercheck"; });
  const es = emp.lang === "es";
  const tell = async (en: string, sp: string) => { const nid = "n" + crypto.randomUUID().replace(/-/g, "");
    await adm.from("records").upsert({ coll: "inbox", id: nid, deleted: false, updated_by: "server", updated_at: new Date().toISOString(),
      data: { id: nid, to: user, msg: es ? sp : en, kind: "warn", ts: Date.now(), read: false, link: { tab: "punch" }, auto: true } }, { onConflict: "coll,id" }); };
  const save = async (id: string, d: any) => adm.from("records").update({ data: d, updated_at: new Date().toISOString(), updated_by: "owntracks" }).eq("coll", "punches").eq("id", id);
  return { emp, site, open, waiting, tell, save };
}

// he has been at job `sid` for 5 minutes (arrived at `at`)
async function arrived(adm: any, user: string, sid: string, at: number, lat: number | null, lng: number | null, now: number, lastAt: number = at) {
  const { emp, site, open, waiting, tell, save } = await load(adm, user, now);
  const S = site[sid]; if (!S || emp.inactive) return "";
  if (S.stage === "lost" && !(open && open.d.site === sid)) return "lost bid, not a job in the app — ignored";
  if (!open && waiting) return "waiting for office approval — no reminder";
  if (open && open.d.site === sid) return "";                       // already clocked in here
  if (open && (open.d.site || open.d.newJob) && Number(open.d.in) < at) {
    const A = placeOf(open.d, site) || ({} as any); let lv = open.d.away && at - Number(open.d.away) <= 3600000 ? Number(open.d.away) : at;
    if (A.lat != null && S.lat != null) { const km = distM(+A.lat, +A.lng, +S.lat, +S.lng) / 1000; lv = Math.min(lv, at - Math.max(3, Math.round(km * 1.3 / 40 * 60)) * 60000); }
    lv = Math.min(at, Math.max(lv, at - 3600000, Number(open.d.seen) || 0, Number(open.d.in) + 60000));
    const old = { ...open.d, out: lv }; delete old.away; delete old.awayBy;
    await save(open.id, old);
    const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 14);
    await adm.from("records").upsert({ coll: "punches", id, deleted: false, updated_by: "owntracks", updated_at: new Date().toISOString(),
      data: { id, who: user, site: sid, in: lv, out: null, lat, lng, selfie: open.d.selfie || "", transfer: true, auto: "phone", seen: Math.max(at, now - 60000), ...(open.d.pending ? { afterPending: open.id } : {}) } }, { onConflict: "coll,id" });
    await tell("↔ You are at " + short(S.name) + " — your clock switched there by itself (from " + hm(lv) + ").",
      "↔ Está en " + short(S.name) + " — su reloj cambió solo a este trabajo (desde las " + hm(lv) + ").");
    return "clock: switched from " + (open.d.site || "a job not in the app");
  }
  if (!open && hourNY(at) >= 6 && hourNY(at) < 19 && dkey(at) === dkey(now) && emp.appClock === true && now - lastAt <= STALE + DWELL) {   // no reminder from old readings
    // Baruch 11/21: office people (Shia …) and the owner never get "punch in" reminders; and none after the workday ends —
    // 7:00 PM, Friday 1:15 PM, or the go-home time the boss set ("Go home at") — unless he was kept late (Stay late)
    if (emp.role === "office" || emp.role === "owner") return "office — no punch-in reminder";
    { const day = dkey(at); const dow = new Date(day + "T12:00:00Z").getUTCDay();
      const endM = (await schedEnd(adm, emp, user, day)) ?? (dow === 5 ? 795 : 1140);
      const mNY = hourNY(at) * 60 + Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, minute: "numeric" }).format(new Date(at)));
      if (mNY >= endM) {
        const { data: gl } = await adm.from("records").select("data").eq("coll", "goHomeLog").eq("deleted", false).eq("data->>who", user);
        const last = (gl || []).map((r: any) => r.data || {}).filter((x: any) => Number(x.ts) > 0 && dkey(Number(x.ts)) === day).sort((a: any, b: any) => Number(a.ts) - Number(b.ts)).pop();
        if (!(last && last.kind === "late")) return "after the workday — no punch-in reminder";
      } }
    // Baruch 11/20 (Lennin got it 9 times in 2 hours): one reminder, a 2nd one 30 minutes later if he is still not punched in,
    // then ONE message to the office (the same people who get the 8:30 list), then nothing more for that job today.
    // Baruch 11/20: a punch made with no signal waits on his phone — the reminder tells him to open the app where he has signal
    const en0 = "📍 You are at " + short(S.name) + ". Open the app and punch in.", sp0 = "📍 Está en " + short(S.name) + ". Abra la app y marque entrada.";
    const en = en0 + " Already punched in? Open the app where you have signal so it gets sent.", sp = sp0 + " ¿Ya marcó? Abra la app donde tenga señal para que se envíe.";
    const { data: ib } = await adm.from("records").select("data").eq("coll", "inbox").eq("deleted", false).eq("data->>to", user).gte("data->>ts", String(now - 20 * 3600000));
    const sent = (ib || []).map((r: any) => r.data || {}).filter((x: any) => [en, sp, en0, sp0].includes(x.msg) && dkey(Number(x.ts)) === dkey(now)).map((x: any) => Number(x.ts)).sort((a: number, b: number) => a - b);
    if (sent.length === 0 || (sent.length === 1 && now - sent[0] >= 30 * 60000)) { await tell(en, sp); return sent.length ? "reminded again (2nd)" : "reminded to punch in"; }
    if (sent.length === 1) return "reminded already — 2nd reminder after 30 min";
    if (now - sent[1] < 15 * 60000) return "reminded twice — office is told 15 min after the 2nd";
    const tag = "notin:" + user + ":" + sid + ":" + dkey(now);
    const { data: done } = await adm.from("records").select("id").eq("coll", "inbox").eq("data->>tag", tag);
    if (done && done.length) return "reminded twice, office told — no more";
    // who: Shia (o1) and Baruch (u1), plus the site manager(s) of THAT job (job folder → site managers; else his crew's manager)
    const { data: sr } = await adm.from("records").select("data").eq("coll", "sites").eq("id", sid).maybeSingle();
    let mg: string[] = Array.isArray(sr?.data?.managers) ? sr.data.managers : (sr?.data?.manager ? [sr.data.manager] : []);
    if (!mg.length && emp.crew) { const { data: cr } = await adm.from("records").select("data").eq("coll", "crews").eq("id", emp.crew).maybeSingle();
      mg = Array.isArray(cr?.data?.managers) ? cr.data.managers : (cr?.data?.manager ? [cr.data.manager] : []); }
    const to = [...new Set(["o1", "u1", ...mg.map(String)].filter((x) => x && x !== user))];
    const since = hm(sent[0] - DWELL), nm = String(emp.name || user);
    for (const o of to) {
      const { data: oe } = await adm.from("records").select("data").eq("coll", "emps").eq("id", o).maybeSingle();
      const msg = (oe?.data?.lang === "es")
        ? "📍 " + nm + " está en " + short(S.name) + " desde las " + since + " y no marcó entrada, o su marca todavía no nos llegó (¿sin señal?). Se le avisó 2 veces."
        : "📍 " + nm + " has been at " + short(S.name) + " since " + since + " and is not punched in, or his punch hasn't reached us yet (no signal?). He was reminded twice.";
      const nid = "n" + crypto.randomUUID().replace(/-/g, "");
      await adm.from("records").upsert({ coll: "inbox", id: nid, deleted: false, updated_by: "server", updated_at: new Date().toISOString(),
        data: { id: nid, to: o, msg, kind: "warn", ts: Date.now(), read: false, link: { tab: "hours" }, auto: true, tag } }, { onConflict: "coll,id" });
    }
    return "reminded twice — office told";
  }
  return "";
}

// work hours for the 5-minute reporting (Baruch 11/18): Mon–Thu 7:00 AM–8:00 PM, Friday 7:00 AM–2:15 PM (the workday 8–7 /
// 8–1:15 plus 1 hour before and after); Sunday only when his crew (or he himself) is booked that day; never on Saturday or a
// day off. Kept late ("Stay late") → until 1 hour after "Send home" (never sent home → until midnight).
async function workWindow(adm: any, emp: any, user: string, now: number): Promise<boolean> {
  const day = dkey(now);
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date(now));
  const g = (t: string) => (p.find((x) => x.type === t) || { value: "" }).value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  const min = (Number(g("hour")) % 24) * 60 + Number(g("minute"));
  if (dow === 6) return false;
  const { data: off } = await adm.from("records").select("data").eq("coll", "daysOff").eq("id", day).eq("deleted", false).maybeSingle();
  if (off?.data?.off === true) return false;
  if (dow === 0) {
    let booked = false;
    if (emp.crew) { const { data: sc } = await adm.from("records").select("data").eq("coll", "sched").eq("id", emp.crew + "|" + day).eq("deleted", false).maybeSingle();
      const sd: any = sc?.data || {}; booked = !sd.cancel && (!!sd.site || (Array.isArray(sd.assignments) && sd.assignments.length > 0)); }
    if (!booked) { const { data: ln } = await adm.from("records").select("data").eq("coll", "sched").eq("id", "L:" + user + "|" + day).eq("deleted", false).maybeSingle();
      booked = !!ln?.data && Array.isArray(ln.data.assignments) && ln.data.assignments.length > 0; }
    if (!booked) return false;
  }
  const start = Math.min(7 * 60, (await schedStart(adm, emp, user, day)) - 60), end0 = dow === 5 ? 14 * 60 + 15 : 20 * 60;   // booked early → 1 hour before it
  const he = await schedEnd(adm, emp, user, day); const end = he != null ? he + 60 : end0;   // "Go home at" → until 1 hour after it
  if (min < start) return false;
  if (min < end) return true;
  // after hours: kept late → until 1 hour after "Send home"
  const { data: gl } = await adm.from("records").select("data").eq("coll", "goHomeLog").eq("deleted", false).eq("data->>who", user);
  const today = (gl || []).map((r: any) => r.data || {}).filter((x: any) => Number(x.ts) > 0 && dkey(Number(x.ts)) === day).sort((a: any, b: any) => Number(a.ts) - Number(b.ts));
  const lateAt = today.filter((x: any) => x.kind === "late").map((x: any) => Number(x.ts)).pop();
  if (!lateAt) return false;
  const homeAt = today.filter((x: any) => x.kind !== "late" && Number(x.ts) > lateAt).map((x: any) => Number(x.ts))[0];
  return homeAt ? now < homeAt + 3600000 : true;
}

export const handle = async (req: Request, adm: any): Promise<Response> => {
  if (req.method !== "POST") return json([]);
  const now = Date.now();
  // the 1-minute timer: act on arrivals that have lasted 5 minutes
  const sec = req.headers.get("x-push-secret") || "";
  if (sec) {
    const { data: sc } = await adm.from("server_config").select("v").eq("k", "secret").maybeSingle();
    if (!sc?.v || sc.v.length < 16 || sc.v !== sec) return json({ error: "secret" }, 403);
    const { data: due } = await adm.rpc("ot_due", { p_before: now - DWELL });
    const res: any[] = [];
    for (const d of due || []) { const note = await arrived(adm, d.who, d.site, Number(d.at), d.lat ?? null, d.lng ?? null, now, Number(d.last ?? d.at));
      await adm.rpc("ot_note", { p_who: d.who, p_kind: "stay5", p_site: d.site, p_at: Number(d.at), p_note: note || null, p_wp: null }); res.push({ who: d.who, site: d.site, note }); }
    return json({ done: res.length, res });
  }
  const m = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") || ""); if (!m) return json({ error: "login" }, 401);
  let user = "", pass = ""; try { const t = atob(m[1]); const i = t.indexOf(":"); user = t.slice(0, i); pass = t.slice(i + 1); } catch (_) { return json({ error: "login" }, 401); }
  const { data: ck } = await adm.rpc("ot_check", { p_who: user, p_token: pass });
  if (!ck || !ck.ok) return json({ error: "login" }, 401);
  let msg: any = {}; try { msg = await req.json(); } catch (_) { msg = {}; }
  const { emp, site, open, tell, save } = await load(adm, user, now);
  if (emp.inactive) return json([]);
  // Baruch 11/22: keep the phone's battery level (OwnTracks sends batt % and bs 0 unknown / 1 unplugged / 2 charging / 3 full with every
  // location report) so Today can show a small "7%" on his circle before his phone dies. Older reports never overwrite a newer one.
  if (msg._type === "location" && msg.batt != null && Number.isFinite(Number(msg.batt))) {
    const tb = Number(msg.tst) > 1e9 ? Math.min(Number(msg.tst) * 1000, now) : now;
    try { await adm.rpc("ot_batt", { p_who: user, p_batt: Math.round(Number(msg.batt)), p_bs: msg.bs != null && Number.isFinite(Number(msg.bs)) ? Number(msg.bs) : null, p_at: tb }); } catch (_) { /* never stops the tracker */ }
  }
  let kind: string | null = null, kSite: string | null = null, note = "";
  const at = Number(msg.tst) > 1e9 ? Math.min(Number(msg.tst) * 1000, now) : now;
  // Baruch 11/18 (7): a job on his schedule for that day needs no proof — on the clock and arriving there switches him on the
  // first report (no 5 minutes, no second report). Only a job we did not send him to still needs the proof.
  let schedSet: Set<string> | null = null, switched = false;
  const onSched = async (sid: string) => { if (!open) return false; if (!schedSet) schedSet = await schedSites(adm, emp, user, dkey(at)); return schedSet.has(sid); };
  const switchNow = async (sid: string, lat: number | null, lng: number | null) => {
    await adm.rpc("ot_pend", { p_who: user, p_site: "*", p_at: null, p_lat: null, p_lng: null });
    const r = await arrived(adm, user, sid, at, lat, lng, now); return r ? r + " (on his schedule)" : "";
  };

  // Baruch 11/19: new or repeat? (location readings only; arrive/leave events always count)
  let repeat = false;
  if (msg._type === "location" && Number(msg.tst) > 1e9) {
    const { data: prevT } = await adm.rpc("ot_tst", { p_who: user, p_tst: at });
    if (prevT != null && Number(prevT) > 0 && at <= Number(prevT)) repeat = true;
  }
  if (now - at > MAXAGE || dkey(at) !== dkey(now)) {
    note = "old report ignored (" + Math.round((now - at) / 60000) + " min old, other day / over 12 h)";
  } else if (repeat) {
    note = "repeat of a reading already handled — ignored";
  } else if (msg._type === "transition" && (msg.event === "enter" || msg.event === "leave")) {
    const sid = (/#([A-Za-z0-9_.:-]+)\s*$/.exec(String(msg.desc || "")) || [])[1] || null;
    if (sid && sid.startsWith("nj_") && open && "nj_" + open.id === sid) {
      kind = msg.event === "enter" ? "arrive" : "leave"; kSite = sid; const nm = String(open.d.newJob?.text || "the job").slice(0, 60);
      if (kind === "leave" && !open.d.away && Number(open.d.in) < at) {
        await save(open.id, { ...open.d, away: at, awayBy: "phone" }); note = "clock: away (job not in the app)";
        await tell("🚗 You left " + nm + " at " + hm(at) + ". Not back within 1 hour: your clock closes at " + hm(at) + ".", "🚗 Salió de " + nm + " a las " + hm(at) + ". Si no vuelve en 1 hora, su reloj se cierra a las " + hm(at) + ".");
      } else if (kind === "arrive" && open.d.away) { const gap = at - Number(open.d.away); const d = { ...open.d, seen: at };
        if (gap >= 0 && gap <= 3600000) d.trips = [...(open.d.trips || []), { left: Number(open.d.away), back: at }]; delete d.away; delete d.awayBy; await save(open.id, d); note = "clock: back on site"; }
    } else if (sid && site[sid]) {
      kind = msg.event === "enter" ? "arrive" : "leave"; kSite = sid;
      const S = site[sid];
      if (kind === "leave") {
        await adm.rpc("ot_pend", { p_who: user, p_site: sid, p_at: null, p_lat: null, p_lng: null });   // drove past: no switch
        if (open && open.d.site === sid && !open.d.away && Number(open.d.in) < at) {
          await save(open.id, { ...open.d, away: at, awayBy: "phone" }); note = "clock: away";
          await tell("🚗 You left " + short(S.name) + " at " + hm(at) + ". At another job in the app? The clock switches by itself after 5 minutes there. Not back within 1 hour: your clock closes at " + hm(at) + ".",
            "🚗 Salió de " + short(S.name) + " a las " + hm(at) + ". ¿En otro trabajo de la app? El reloj cambia solo después de 5 minutos allí. Si no vuelve en 1 hora, su reloj se cierra a las " + hm(at) + ".");
        }
      } else if (open && open.d.site === sid) {
        if (open.d.away) { const gap = at - Number(open.d.away);
          const d = { ...open.d, seen: at }; if (gap >= 0 && gap <= 3600000) d.trips = [...(open.d.trips || []), { left: Number(open.d.away), back: at }];
          delete d.away; delete d.awayBy; await save(open.id, d); note = "clock: back on site"; }
      } else if (open && Number(open.d.in) < at && await onSched(sid)) {
        note = await switchNow(sid, msg.lat ?? null, msg.lon ?? null) || "on his schedule";
      } else {
        await adm.rpc("ot_pend", { p_who: user, p_site: sid, p_at: at, p_lat: msg.lat ?? null, p_lng: msg.lon ?? null }); note = "waiting 5 min";
      }
    }
  } else if (msg._type === "location" && msg.lat != null && Number(msg.acc || 0) <= 150) {
    // used only to know whether he is still at the job he is clocked in at, and (11/12) whether he is standing at ANY job
    // in the app — the phone can watch only 20 places, there are ~200 jobs. The position itself is not kept.
    const S = open ? placeOf(open.d, site) : null;
    const slack = Math.min(Number(msg.acc) || 0, 150);
    const atOpen = !!(S && S.lat != null && distM(+msg.lat, +msg.lon, +S.lat, +S.lng) <= S.rad + slack);
    if (!atOpen) {
      let best: string | null = null, bestD = Infinity;
      for (const id in site) { const J = site[id]; if (J.lat == null || J.lng == null || !inApp(J)) continue;
        const dm = distM(+msg.lat, +msg.lon, +J.lat, +J.lng); if (dm <= radM(J) + slack && dm < bestD) { best = id; bestD = dm; } }
      if (best && open && open.d.site !== best && Number(open.d.in) < at && await onSched(best)) {
        // Baruch 11/18 (7): a job on his schedule today → switch on this first report
        const r = await switchNow(best, msg.lat, msg.lon); kind = "arrive"; kSite = best; note = r || "on his schedule";
        if (r.startsWith("clock: switched")) switched = true;
      } else if (best && !(open && open.d.site === best)) {
        await adm.rpc("ot_pend", { p_who: user, p_site: best, p_at: at, p_lat: msg.lat, p_lng: msg.lon, p_src: "loc" });   // switches after 5 minutes there, once a 2nd report confirms it
        if (!note) note = "at " + best + ", waiting 5 min";
      } else if (!best) await adm.rpc("ot_pend", { p_who: user, p_site: "*", p_at: null, p_lat: null, p_lng: null });   // drove past: no switch
    }
    if (S && S.lat != null && !switched) {
      const dm = distM(+msg.lat, +msg.lon, +S.lat, +S.lng);
      if (dm <= S.rad + Math.min(Number(msg.acc) || 0, 150) && at > (Number(open.d.seen) || 0)) {
        const d = { ...open.d, seen: at };
        if (open.d.away && at > Number(open.d.away)) { const gap = at - Number(open.d.away); if (gap <= 3600000) d.trips = [...(open.d.trips || []), { left: Number(open.d.away), back: at }]; delete d.away; delete d.awayBy; }
        await save(open.id, d);
      } else if (dm > Math.max(400, 3 * S.rad) && !open.d.away && Number(open.d.in) < at) {
        // far from his job and no "left" came (the phone wasn't watching this job yet) → away from now
        await save(open.id, { ...open.d, away: Math.max(at, Number(open.d.seen) || 0), awayBy: "phone-far" }); kind = "leave"; kSite = open.d.site || "nj_" + open.id; note = "far from the job" + (note ? "; " + note : "");
      }
    }
  }

  // the jobs his phone should watch: the job he is on + today's schedule for his crew + his jobs of the last 3 weeks, up to 20
  const want: string[] = [];
  if (open && open.d.site) want.push(open.d.site);
  // today's schedule — the day booking, the crew's ongoing job and jobs he alone was sent to (Baruch 11/18)
  const ss = schedSet as Set<string> | null;
  for (const sid of (ss && dkey(at) === dkey(now) ? ss : await schedSites(adm, emp, user, dkey(now)))) want.push(sid);
  const { data: rec } = await adm.from("records").select("data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 21 * 86400000));
  for (const r of (rec || []).sort((a: any, b: any) => Number(b.data?.in) - Number(a.data?.in))) if (r.data?.site) want.push(r.data.site);
  // the job he is clocked in at is always watched, even when it is marked done (Baruch 11/12: 11 Canterbury was skipped)
  const onNow = open && open.d.site ? open.d.site : null;
  const wl = [...new Set(want)].filter((id) => site[id] && site[id].lat != null && site[id].lng != null && (id === onNow || inApp(site[id]))).slice(0, 20);
  const wps: any[] = [];
  if (open && !open.d.site && open.d.newJob && open.d.newJob.lat != null)
    wps.push({ _type: "waypoint", desc: String(open.d.newJob.text || "New job").replace(/#/g, "").slice(0, 40) + " #nj_" + open.id, lat: +open.d.newJob.lat, lon: +open.d.newJob.lng, rad: 150,
      tst: 1500000000 + ([...open.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99999989, 7)) });
  wps.push(...wl.slice(0, 20 - wps.length).map((id) => ({ _type: "waypoint", desc: short(site[id].name).slice(0, 40) + " #" + id, lat: +site[id].lat, lon: +site[id].lng, rad: Math.round(radM(site[id])),
    tst: 1600000000 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99999989, 7)) })));
  const hash = wps.map((w) => w.desc + "@" + w.lat.toFixed(5) + "," + w.lon.toFixed(5) + "/" + w.rad).join("|");
  // Baruch 11/18 (2): the phone reports every 5 minutes ("Move mode") during work hours — not only when it moves (an iPhone
  // otherwise reports only when it moves). Work hours = the workday plus 1 hour before and after; kept late = until 1 hour
  // after "Send home". Outside that, the normal mode. Trial: only people with emps.otMove = true (Shia first).
  const moveOn = emp.otMove === true && await workWindow(adm, emp, user, now);
  // Baruch 11/18 (3): distance 250 (Baruch, 11/18 late), not 0 (0 flooded the server with a report every few seconds), and on Android never more
  // often than the 5-minute interval (pegLocatorFastestIntervalToInterval) — the setup that works on Shia's phone. The new
  // tag "move100" makes every phone in the trial get the new setting once.
  const mode = emp.otMove === true ? (moveOn ? "|m:move250" : "|m:sig") : "";
  const hashM = hash + mode;
  const out: any[] = [];
  // Baruch 11/19: the job list is wiped and reloaded ONLY when the jobs change — switching 5-minute / normal mode (7 AM, 8 PM)
  // used to reload it too, and an iPhone standing inside a job could then miss its next "arrived" / "left"
  const prev = ck.wp || ""; const pi = prev.lastIndexOf("|m:");
  const prevJobs = pi >= 0 ? prev.slice(0, pi) : prev, prevMode = pi >= 0 ? prev.slice(pi) : "";
  if (hash !== prevJobs) {
    out.push({ _type: "cmd", action: "clearWaypoints" });
    out.push({ _type: "cmd", action: "setWaypoints", waypoints: { _type: "waypoints", waypoints: wps } });
  }
  if (mode !== prevMode) {
    if (mode) out.push({ _type: "cmd", action: "setConfiguration", configuration: moveOn
      ? { _type: "configuration", monitoring: 2, locatorInterval: 300, moveModeLocatorInterval: 300, locatorDisplacement: 250, pegLocatorFastestIntervalToInterval: true }
      : { _type: "configuration", monitoring: 1 } });
  }
  await adm.rpc("ot_note", { p_who: user, p_kind: kind, p_site: kSite, p_at: at, p_note: note || null, p_wp: hashM !== (ck.wp || "") ? hashM : null });
  return json(out);
};

if (typeof Deno !== "undefined" && (Deno as any).serve && !(globalThis as any).__OT_TEST) {
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, adm).catch((e) => json({ error: String(e).slice(0, 200) }, 500)));
}
