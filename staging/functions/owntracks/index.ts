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
const radM = (s: any) => Math.max(100, (Number(s?.rad) || 300) * 0.3048);   // the app keeps the fence in feet; phones need ≥ ~100 m

// where a punch is: a job in the app, or (Baruch 11/11) a "job not in the app" at the GPS point he punched in at
const placeOf = (d: any, site: Record<string, any>) => d.site && site[d.site] ? { key: d.site, lat: site[d.site].lat, lng: site[d.site].lng, rad: radM(site[d.site]), name: site[d.site].name }
  : d.newJob && d.newJob.lat != null ? { key: null, lat: d.newJob.lat, lng: d.newJob.lng, rad: 150, name: d.newJob.text || "the job" } : null;
async function load(adm: any, user: string, now: number) {
  const { data: er } = await adm.from("records").select("id,data").eq("coll", "emps").eq("id", user).maybeSingle();
  const emp = er?.data || {};
  const { data: srows } = await adm.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
  const site: Record<string, any> = {}; for (const s of srows || []) site[s.id] = s.data || {};
  const { data: pr } = await adm.from("records").select("id,data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 20 * 3600000));
  const open = (pr || []).map((r: any) => ({ id: r.id, d: r.data || {} }))
    .filter((x: any) => x.d.out == null && !x.d.voided && !x.d.pending && x.d.src !== "fingercheck").sort((a: any, b: any) => Number(b.d.in) - Number(a.d.in))[0] || null;
  const es = emp.lang === "es";
  const tell = async (en: string, sp: string) => { const nid = "n" + crypto.randomUUID().replace(/-/g, "");
    await adm.from("records").upsert({ coll: "inbox", id: nid, deleted: false, updated_by: "server", updated_at: new Date().toISOString(),
      data: { id: nid, to: user, msg: es ? sp : en, kind: "warn", ts: Date.now(), read: false, link: { tab: "punch" }, auto: true } }, { onConflict: "coll,id" }); };
  const save = async (id: string, d: any) => adm.from("records").update({ data: d, updated_at: new Date().toISOString(), updated_by: "owntracks" }).eq("coll", "punches").eq("id", id);
  return { emp, site, open, tell, save };
}

// he has been at job `sid` for 5 minutes (arrived at `at`)
async function arrived(adm: any, user: string, sid: string, at: number, lat: number | null, lng: number | null, now: number) {
  const { emp, site, open, tell, save } = await load(adm, user, now);
  const S = site[sid]; if (!S || emp.inactive) return "";
  if (open && open.d.site === sid) return "";                       // already clocked in here
  if (open && (open.d.site || open.d.newJob) && Number(open.d.in) < at) {
    const A = placeOf(open.d, site) || ({} as any); let lv = open.d.away && at - Number(open.d.away) <= 3600000 ? Number(open.d.away) : at;
    if (A.lat != null && S.lat != null) { const km = distM(+A.lat, +A.lng, +S.lat, +S.lng) / 1000; lv = Math.min(lv, at - Math.max(3, Math.round(km * 1.3 / 40 * 60)) * 60000); }
    lv = Math.min(at, Math.max(lv, at - 3600000, Number(open.d.seen) || 0, Number(open.d.in) + 60000));
    const old = { ...open.d, out: lv }; delete old.away; delete old.awayBy;
    await save(open.id, old);
    const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 14);
    await adm.from("records").upsert({ coll: "punches", id, deleted: false, updated_by: "owntracks", updated_at: new Date().toISOString(),
      data: { id, who: user, site: sid, in: lv, out: null, lat, lng, selfie: open.d.selfie || "", transfer: true, auto: "phone", seen: Math.max(at, now - 60000) } }, { onConflict: "coll,id" });
    await tell("↔ You are at " + short(S.name) + " — your clock switched there by itself (from " + hm(lv) + ").",
      "↔ Está en " + short(S.name) + " — su reloj cambió solo a este trabajo (desde las " + hm(lv) + ").");
    return "clock: switched from " + (open.d.site || "a job not in the app");
  }
  if (!open && hourNY(at) >= 6 && hourNY(at) < 19 && dkey(at) === dkey(now) && emp.appClock === true) {
    await tell("📍 You are at " + short(S.name) + ". Open the app and punch in.", "📍 Está en " + short(S.name) + ". Abra la app y marque entrada.");
    return "reminded to punch in";
  }
  return "";
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
    for (const d of due || []) { const note = await arrived(adm, d.who, d.site, Number(d.at), d.lat ?? null, d.lng ?? null, now);
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
  let kind: string | null = null, kSite: string | null = null, note = "";
  const at = Number(msg.tst) > 1e9 ? Math.min(Number(msg.tst) * 1000, now) : now;

  if (msg._type === "transition" && (msg.event === "enter" || msg.event === "leave")) {
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
      for (const id in site) { const J = site[id]; if (J.lat == null || J.lng == null || J.stage === "done") continue;
        const dm = distM(+msg.lat, +msg.lon, +J.lat, +J.lng); if (dm <= radM(J) + slack && dm < bestD) { best = id; bestD = dm; } }
      if (best && !(open && open.d.site === best)) {
        await adm.rpc("ot_pend", { p_who: user, p_site: best, p_at: at, p_lat: msg.lat, p_lng: msg.lon, p_src: "loc" });   // switches after 5 minutes there, once a 2nd report confirms it
        if (!note) note = "at " + best + ", waiting 5 min";
      } else if (!best) await adm.rpc("ot_pend", { p_who: user, p_site: "*", p_at: null, p_lat: null, p_lng: null });   // drove past: no switch
    }
    if (S && S.lat != null) {
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
  if (emp.crew) { const { data: sc } = await adm.from("records").select("data").eq("coll", "sched").eq("id", emp.crew + "|" + dkey(now)).maybeSingle();
    const sd: any = sc?.data || {}; if (sd.site) want.push(sd.site); for (const a of Array.isArray(sd.assignments) ? sd.assignments : []) if (a && a.site) want.push(a.site); }
  const { data: rec } = await adm.from("records").select("data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 21 * 86400000));
  for (const r of (rec || []).sort((a: any, b: any) => Number(b.data?.in) - Number(a.data?.in))) if (r.data?.site) want.push(r.data.site);
  // the job he is clocked in at is always watched, even when it is marked done (Baruch 11/12: 11 Canterbury was skipped)
  const onNow = open && open.d.site ? open.d.site : null;
  const wl = [...new Set(want)].filter((id) => site[id] && site[id].lat != null && site[id].lng != null && (id === onNow || site[id].stage !== "done")).slice(0, 20);
  const wps: any[] = [];
  if (open && !open.d.site && open.d.newJob && open.d.newJob.lat != null)
    wps.push({ _type: "waypoint", desc: String(open.d.newJob.text || "New job").replace(/#/g, "").slice(0, 40) + " #nj_" + open.id, lat: +open.d.newJob.lat, lon: +open.d.newJob.lng, rad: 150,
      tst: 1500000000 + ([...open.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99999989, 7)) });
  wps.push(...wl.slice(0, 20 - wps.length).map((id) => ({ _type: "waypoint", desc: short(site[id].name).slice(0, 40) + " #" + id, lat: +site[id].lat, lon: +site[id].lng, rad: Math.round(radM(site[id])),
    tst: 1600000000 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99999989, 7)) })));
  const hash = wps.map((w) => w.desc + "@" + w.lat.toFixed(5) + "," + w.lon.toFixed(5) + "/" + w.rad).join("|");
  const out: any[] = [];
  if (hash !== (ck.wp || "")) {
    out.push({ _type: "cmd", action: "clearWaypoints" });
    out.push({ _type: "cmd", action: "setWaypoints", waypoints: { _type: "waypoints", waypoints: wps } });
  }
  await adm.rpc("ot_note", { p_who: user, p_kind: kind, p_site: kSite, p_at: at, p_note: note || null, p_wp: hash !== (ck.wp || "") ? hash : null });
  return json(out);
};

if (typeof Deno !== "undefined" && (Deno as any).serve && !(globalThis as any).__OT_TEST) {
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req) => handle(req, adm).catch((e) => json({ error: String(e).slice(0, 200) }, 500)));
}
