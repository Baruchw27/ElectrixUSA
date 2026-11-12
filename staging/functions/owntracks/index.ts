// Supabase Edge Function "owntracks" — automatic time clock (Baruch 11/11).
// The free OwnTracks phone app watches each man's Electrix job areas by itself (even with every app closed) and POSTs here
// when he arrives at or leaves a job. Login: HTTP Basic, user = Electrix person id, password = his own token (ot_setup).
// What is kept: only "arrived at / left" an Electrix job, and the last time his phone was seen inside the job he is clocked
// in at. Every other location the phone sends is thrown away. Nothing happens to anyone who is not on the clock, except a
// one-line "punch in" reminder when he arrives at a job during the workday.
//   leave the job he is clocked in at  → away = time he left (the server closes the clock there if he isn't back within 1 h)
//   back at that job within 1 h         → the time away stays on the clock (material run), as the app does
//   arrive at ANOTHER job while on clock → switch: the old job ends when he left it, the new one starts then (drive → new job)
// The answer to every message tells the phone which jobs to watch (up to 20: today's schedule + his jobs of the last 3 weeks).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "America/New_York";
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const dkey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
const hourNY = (ms: number) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date(ms))) % 24;
const hm = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const distM = (a: number, b: number, c: number, d: number) => { const R = 6371000, p = Math.PI / 180, x = (c - a) * p, y = (d - b) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const short = (n: string) => String(n || "").replace(/,?\s*NY\s*\d{5}.*$/i, "").replace(/,?\s*NJ\s*\d{5}.*$/i, "").trim();
const radM = (s: any) => Math.max(100, (Number(s?.rad) || 300) * 0.3048);   // the app keeps the fence in feet; phones need ≥ ~100 m

export const handle = async (req: Request, adm: any): Promise<Response> => {
  if (req.method !== "POST") return json([]);
  const m = /^Basic\s+(.+)$/i.exec(req.headers.get("authorization") || ""); if (!m) return json({ error: "login" }, 401);
  let user = "", pass = ""; try { const t = atob(m[1]); const i = t.indexOf(":"); user = t.slice(0, i); pass = t.slice(i + 1); } catch (_) { return json({ error: "login" }, 401); }
  const { data: ck } = await adm.rpc("ot_check", { p_who: user, p_token: pass });
  if (!ck || !ck.ok) return json({ error: "login" }, 401);
  let msg: any = {}; try { msg = await req.json(); } catch (_) { msg = {}; }
  const now = Date.now();
  const { data: er } = await adm.from("records").select("id,data").eq("coll", "emps").eq("id", user).maybeSingle();
  const emp = er?.data || {}; if (emp.inactive) return json([]);
  const es = emp.lang === "es";
  const { data: srows } = await adm.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
  const site: Record<string, any> = {}; for (const s of srows || []) site[s.id] = s.data || {};
  const tell = async (en: string, sp: string) => { const nid = "n" + crypto.randomUUID().replace(/-/g, "");
    await adm.from("records").upsert({ coll: "inbox", id: nid, deleted: false, updated_by: "server", updated_at: new Date().toISOString(),
      data: { id: nid, to: user, msg: es ? sp : en, kind: "warn", ts: Date.now(), read: false, link: { tab: "punch" }, auto: true } }, { onConflict: "coll,id" }); };
  // his punches of the last 20 h → the open one
  const { data: pr } = await adm.from("records").select("id,data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 20 * 3600000));
  const open = (pr || []).map((r: any) => ({ id: r.id, d: r.data || {} }))
    .filter((x: any) => x.d.out == null && !x.d.voided && !x.d.pending && x.d.src !== "fingercheck").sort((a: any, b: any) => Number(b.d.in) - Number(a.d.in))[0] || null;
  const save = async (id: string, d: any) => adm.from("records").update({ data: d, updated_at: new Date().toISOString(), updated_by: "owntracks" }).eq("coll", "punches").eq("id", id);
  let kind: string | null = null, kSite: string | null = null, note = "";
  const at = Number(msg.tst) > 1e9 ? Math.min(Number(msg.tst) * 1000, now) : now;

  if (msg._type === "transition" && (msg.event === "enter" || msg.event === "leave")) {
    const sid = (/#([A-Za-z0-9_.:-]+)\s*$/.exec(String(msg.desc || "")) || [])[1] || null;
    if (sid && site[sid]) {
      kind = msg.event === "enter" ? "arrive" : "leave"; kSite = sid;
      const S = site[sid];
      if (kind === "leave" && open && open.d.site === sid && !open.d.away && Number(open.d.in) < at && !(Number(open.d.driveUntil) > at)) {
        await save(open.id, { ...open.d, away: at, awayBy: "phone" }); note = "clock: away";
        await tell("🚗 You left " + short(S.name) + " at " + hm(at) + ". At another job? The clock switches by itself when you get there. Not back within 1 hour: your clock closes at " + hm(at) + ".",
          "🚗 Salió de " + short(S.name) + " a las " + hm(at) + ". ¿En otro trabajo? El reloj cambia solo cuando llegue. Si no vuelve en 1 hora, su reloj se cierra a las " + hm(at) + ".");
      } else if (kind === "arrive" && open && open.d.site === sid && open.d.away) {
        const gap = at - Number(open.d.away);
        if (gap >= 0 && gap <= 3600000) { const d = { ...open.d, trips: [...(open.d.trips || []), { left: Number(open.d.away), back: at }] }; delete d.away; delete d.awayBy;
          await save(open.id, d); note = "clock: back on site"; }
      } else if (kind === "arrive" && open && open.d.site && open.d.site !== sid && Number(open.d.in) < at) {
        // switch: the drive goes to the job he drives TO
        const A = site[open.d.site] || {}; let lv = open.d.away && at - Number(open.d.away) <= 3600000 ? Number(open.d.away) : at;
        if (A.lat != null && S.lat != null) { const km = distM(+A.lat, +A.lng, +S.lat, +S.lng) / 1000; lv = Math.min(lv, at - Math.max(3, Math.round(km * 1.3 / 40 * 60)) * 60000); }
        lv = Math.min(at, Math.max(lv, at - 3600000, Number(open.d.seen) || 0, Number(open.d.in) + 60000));
        const old = { ...open.d, out: lv }; delete old.away; delete old.awayBy;
        await save(open.id, old);
        const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 14);
        await adm.from("records").upsert({ coll: "punches", id, deleted: false, updated_by: "owntracks", updated_at: new Date().toISOString(),
          data: { id, who: user, site: sid, in: lv, out: null, lat: msg.lat ?? null, lng: msg.lon ?? null, selfie: open.d.selfie || "", transfer: true, auto: "phone", seen: at } }, { onConflict: "coll,id" });
        note = "clock: switched from " + open.d.site;
        await tell("↔ You arrived at " + short(S.name) + " — your clock switched there by itself (from " + hm(lv) + ").",
          "↔ Llegó a " + short(S.name) + " — su reloj cambió solo a este trabajo (desde las " + hm(lv) + ").");
      } else if (kind === "arrive" && !open && hourNY(at) >= 6 && hourNY(at) < 19 && dkey(at) === dkey(now) && emp.appClock === true) {
        await tell("📍 You are at " + short(S.name) + ". Open the app and punch in.", "📍 Está en " + short(S.name) + ". Abra la app y marque entrada.");
        note = "reminded to punch in";
      }
    }
  } else if (msg._type === "location" && open && open.d.site && site[open.d.site] && msg.lat != null) {
    // only used to know he was still at the job he is clocked in at; the position itself is not kept
    const S = site[open.d.site];
    if (S.lat != null && distM(+msg.lat, +msg.lon, +S.lat, +S.lng) <= radM(S) + Math.min(Number(msg.acc) || 0, 150) && at > (Number(open.d.seen) || 0)) {
      const d = { ...open.d, seen: at };
      if (open.d.away && at > Number(open.d.away)) { const gap = at - Number(open.d.away); if (gap <= 3600000) d.trips = [...(open.d.trips || []), { left: Number(open.d.away), back: at }]; delete d.away; delete d.awayBy; }
      await save(open.id, d);
    }
  }

  // the jobs his phone should watch: today's schedule for his crew + his jobs of the last 3 weeks (newest first), up to 20
  const want: string[] = [];
  if (emp.crew) { const { data: sc } = await adm.from("records").select("data").eq("coll", "sched").eq("id", emp.crew + "|" + dkey(now)).maybeSingle();
    const sd: any = sc?.data || {}; if (sd.site) want.push(sd.site); for (const a of Array.isArray(sd.assignments) ? sd.assignments : []) if (a && a.site) want.push(a.site); }
  if (open && open.d.site) want.unshift(open.d.site);
  const { data: rec } = await adm.from("records").select("data").eq("coll", "punches").eq("deleted", false).eq("data->>who", user).gte("data->>in", String(now - 21 * 86400000));
  for (const r of (rec || []).sort((a: any, b: any) => Number(b.data?.in) - Number(a.data?.in))) if (r.data?.site) want.push(r.data.site);
  const wl = [...new Set(want)].filter((id) => site[id] && site[id].lat != null && site[id].lng != null && site[id].stage !== "done").slice(0, 20);
  const wps = wl.map((id) => ({ _type: "waypoint", desc: short(site[id].name).slice(0, 40) + " #" + id, lat: +site[id].lat, lon: +site[id].lng, rad: Math.round(radM(site[id])), tst: 1600000000 + ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99999989, 7)) }));
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
