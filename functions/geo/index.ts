// Supabase Edge Function "geo": puts every job on the map (GPS point for the punch-in fence)
// and works out the normal drive time from the office (for travel pay).
// Called by the database (cron + when a job is added). Protected by the server_config secret.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const UA = { "User-Agent": "ElectrixUSA-FieldApp/1.0 (office@electrixusa.com)", "Accept": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function candidates(name: string): string[] {
  let n = name.trim();
  const out: string[] = [];
  const add = (x: string) => { x = x.replace(/\s+/g, " ").replace(/\s+,/g, ",").replace(/^[,\s-]+|[,\s-]+$/g, "").trim(); if (x && !out.includes(x)) out.push(x); };
  const gc = n.match(/Greens At Chester\s+B\d+\s+(.+)$/i); if (gc) { add(gc[1] + ", Chester, NY 10918"); return out; }
  if (/Greenhills/i.test(n)) { add("Greenhills, Monsey, NY"); return out; }
  const hv = n.match(/Highview Estates.*?(\d+\s+Belz Way)/i); if (hv) { add(hv[1] + ", Monroe, NY 10950"); add("Belz Way, Monroe, NY 10950"); return out; }
  if (/Palm Tree/i.test(n)) { add("Palm Tree, NY"); return out; }
  if (/^CR 105$/i.test(n)) { add("County Road 105, Monroe, NY"); return out; }
  // drop notes that are not part of the address
  let c = n.replace(/\b(unit|apt|apartment|suite|ste|bldg|building|lot|fl|floor|rm|room)\s*#?\s*[\w\/-]+/gi, " ")
           .replace(/\b(lobby|basement|attic|garage|new contractor|water\s*tre?a?t\w*|service|temp(orary)? power|panel|addition)\b/gi, " ")
           .replace(/\s+-\s+.*$/, (m) => /\b(NY|NJ|CT)\b/.test(m) ? m : " ")
           .replace(/#\s*\d+\w*/g, " ");
  // "107-115 Bethune Blvd" → "107 Bethune Blvd"
  c = c.replace(/^(\d+)[-–](\d+)\s/, "$1 ");
  // put a comma before the town when it's missing ("60 Cromwell Rd Monroe NY 10950")
  c = c.replace(/\b(Rd|Road|St|Street|Ave|Avenue|Ln|Lane|Ct|Court|Dr|Drive|Pl|Place|Blvd|Way|Ter|Terrace|Cir|Circle|Hwy|Pkwy|Path|Trl|Row|Loop)\.?\s+(?=[A-Z][a-z])/, "$1, ");
  const hasState = /\b(NY|New York|NJ|New Jersey|CT)\b/i.test(c);
  add(hasState ? c : c + ", NY");
  if (!hasState) add(c + ", Rockland County, NY");
  if (n !== c) add(hasState ? n : n + ", NY");
  return out;
}

async function census(q: string) {
  try {
    const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(q), { headers: UA });
    const j = await r.json();
    const m = j?.result?.addressMatches?.[0];
    if (m) return { lat: +m.coordinates.y, lng: +m.coordinates.x, label: m.matchedAddress, src: "census", level: "house" };
  } catch (_) { /* next */ }
  return null;
}
let lastNom = 0;
async function nominatim(q: string) {
  const wait = 1100 - (Date.now() - lastNom); if (wait > 0) await sleep(wait); lastNom = Date.now();
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&viewbox=-75.0,41.8,-73.3,40.5&q=" + encodeURIComponent(q), { headers: UA });
    const j = await r.json();
    const h = j?.[0];
    if (h && +h.place_rank >= 26) return { lat: +h.lat, lng: +h.lon, label: h.display_name, src: "osm", level: +h.place_rank >= 28 ? "house" : "street" };
  } catch (_) { /* next */ }
  return null;
}
const DEV: [RegExp, string][] = [
  [/Greens At Chester/i, "The Greens at Chester, Chester, NY"], [/Highview Estates/i, "Belz Way, Monroe, NY"],
  [/Greenhills/i, "Greenhills, Monsey, NY"], [/Aerie Preserve/i, "Aerie Preserve, NY"], [/Alpine acres/i, "Alpine Acres, NY"],
];
async function nominatimArea(q: string) {
  const wait = 1100 - (Date.now() - lastNom); if (wait > 0) await sleep(wait); lastNom = Date.now();
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&viewbox=-75.0,41.8,-73.3,40.5&bounded=1&q=" + encodeURIComponent(q), { headers: UA });
    const h = (await r.json())?.[0];
    if (h && +h.place_rank >= 16) return { lat: +h.lat, lng: +h.lon, label: h.display_name, src: "osm", level: +h.place_rank >= 26 ? "street" : "area" };
  } catch (_) { /* none */ }
  return null;
}
async function locate(name: string) {
  const cs = candidates(name);
  for (const q of cs) { const g = await census(q); if (g) return g; }
  for (const q of cs) { const g = await nominatim(q); if (g) return g; }
  // brand-new streets: the street itself, then the development
  for (const q of cs) { const st = q.replace(/^\d+[A-Za-z]?\s+/, ""); if (st !== q) { const g = await nominatimArea(st); if (g && g.level === "street") return g; } }
  for (const [re, q] of DEV) if (re.test(name)) { const g = await nominatimArea(q); if (g) return g; }
  return null;
}
let lastDriveErr = "";
async function drive(fromLat: number, fromLng: number, lat: number, lng: number) {
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${lng},${lat}?overview=false`, { headers: UA });
    const j = await r.json();
    const rt = j?.routes?.[0];
    if (rt) return { mi: Math.round(rt.distance / 1609.34 * 10) / 10, min: Math.round(rt.duration / 60 * 10) / 10, road: true, fromLat };
    lastDriveErr = "osrm " + r.status + " " + JSON.stringify(j).slice(0, 120);
  } catch (e) { lastDriveErr = "osrm " + String(e).slice(0, 120); }
  return null;
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfgRows } = await sb.from("server_config").select("k,v");
  const cfg: Record<string, string> = {}; for (const r of cfgRows ?? []) cfg[r.k] = r.v;
  if (!cfg.secret || req.headers.get("x-push-secret") !== cfg.secret) return new Response("no", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const max = Math.min(+(body.max || 15), 40);
  const retry = !!body.retry;
  const { data: baseRows } = await sb.from("records").select("id,data").eq("coll", "base").in("id", ["lat", "lng"]);
  const base: Record<string, number> = {}; for (const r of baseRows ?? []) base[r.id] = +r.data;
  const { data: sites } = await sb.from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
  const todo = (sites ?? []).filter((s) => {
    const d = s.data || {};
    if (body.id && s.id !== body.id) return false;
    if (d.lat == null) return (!d.geoServer || retry || body.id) && d.stage !== "done";
    return base.lat && (!d.trip || !d.trip.road || d.trip.fromLat !== base.lat);
  }).sort((a, b) => (a.data.lat == null ? 0 : 1) - (b.data.lat == null ? 0 : 1)).slice(0, max);
  const done: unknown[] = [];
  const t0 = Date.now();
  for (const s of todo) {
    if (Date.now() - t0 > 110000) break;
    const d = { ...(s.data || {}) };
    const patch: Record<string, unknown> = {};
    if (d.lat == null) {
      const g = await locate(String(d.name || ""));
      patch.geoServer = true; patch.geoTried = true;
      if (g) { patch.lat = g.lat; patch.lng = g.lng; patch.rad = d.rad && d.rad !== 300 ? d.rad : (g.level === "house" ? 300 : g.level === "street" ? 600 : 1200); patch.geoLabel = g.label; patch.geoSrc = g.src; patch.geoLevel = g.level; if (!/\b(NY|NJ|CT|New York|New Jersey)\b|\b\d{5}\b/i.test(String(d.name || "")) || g.level !== "house") patch.geoCheck = true; d.lat = g.lat; d.lng = g.lng; }
    }
    if (d.lat != null && base.lat) { const tr = await drive(base.lat, base.lng, +d.lat, +d.lng); if (tr) patch.trip = tr; }
    if (Object.keys(patch).length) {
      const { data: cur } = await sb.from("records").select("data").eq("coll", "sites").eq("id", s.id).single();
      const merged = { ...(cur?.data || {}), ...patch };
      if (cur?.data?.lat != null && patch.lat != null) { delete merged.lat; Object.assign(merged, { lat: cur.data.lat, lng: cur.data.lng, rad: cur.data.rad }); } // someone set it by hand meanwhile
      await sb.from("records").update({ data: merged, updated_by: "server", updated_at: new Date().toISOString() }).eq("coll", "sites").eq("id", s.id);
    }
    done.push({ name: d.name, found: patch.lat != null || s.data?.lat != null, label: patch.geoLabel, level: patch.geoLevel, min: (patch.trip as { min?: number })?.min, driveErr: patch.trip ? undefined : lastDriveErr });
  }
  const left = (sites ?? []).filter((s) => s.data?.lat == null && !s.data?.geoServer && s.data?.stage !== "done").length - done.filter((x: any) => x).length;
  return new Response(JSON.stringify({ did: done.length, left: Math.max(0, left), done }), { headers: { "Content-Type": "application/json" } });
});
