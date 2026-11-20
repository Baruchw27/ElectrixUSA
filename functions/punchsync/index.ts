// Supabase Edge Function "punchsync" (Baruch 11/20): an Android phone's app helper (service worker) sends punches that were
// made with no signal, as soon as the phone has signal again — even with the Electrix app closed (Background Sync).
// Login: the phone's "punch key" (public.bg_key_register while signed in). It can ONLY save that person's own punches,
// and they go through exactly the same checks as the app (they are saved AS that person: guard_punch, late = pending, …).
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const canon = (v: any): string => v === null || typeof v !== "object" ? JSON.stringify(v ?? null)
  : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
const SERVER = new Set(["hist", "lateEntry", "pending", "at", "rev", "by", "seen", "away", "awayBy", "srvIn"]);   // the server adds / owns these
async function sha256(s: string) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b: any; try { b = await req.json(); } catch (_e) { return json({ error: "bad json" }, 400); }
  const dev = String(b?.dev || ""), key = String(b?.key || ""), rows: any[] = Array.isArray(b?.rows) ? b.rows : [];
  if (dev.length < 8 || key.length < 20 || !rows.length || rows.length > 50) return json({ error: "bad request" }, 400);
  const [k] = await sql`select who, uid from private.bg_keys where dev = ${dev} and key_hash = ${await sha256(key)}`;
  if (!k) return json({ error: "key" }, 401);
  // only punches, only his own
  const ids = rows.map((r) => String(r?.id || ""));
  const cur = ids.length ? await sql`select id, data->>'who' who from public.records where coll = 'punches' and id = any(${ids})` : [];
  const owner: Record<string, string> = {}; for (const r of cur) owner[r.id] = r.who;
  const send: any[] = [], skip: string[] = [];
  for (const r of rows) {
    const id = String(r?.id || ""); const obj = r?.full ?? r?.patch;
    const ok = r && r.coll === "punches" && id && obj && typeof obj === "object" && !Array.isArray(obj)
      && (owner[id] == null || owner[id] === k.who) && (r.full ? r.full.who === k.who : (obj.who == null || obj.who === k.who))
      && !Object.values(obj).some((v) => typeof v === "string" && v.startsWith("data:"));   // photos go with the app itself
    if (!ok) { skip.push(id); continue; }
    const x: any = { coll: "punches", id, by: k.who }; if (r.full) x.full = r.full; else { x.patch = r.patch; x.unset = Array.isArray(r.unset) ? r.unset : []; if (r.base) x.base = r.base; }
    send.push(x);
  }
  if (!send.length) return json({ ok: [], skipped: skip });
  const got: any[] = await sql.begin(async (tx: any) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: k.uid, role: "authenticated" })}, true)`;
    await tx.unsafe("set local role authenticated");
    return await tx`select coll, id, data, deleted from public.save_records(${tx.json(send)})`;
  });
  await sql`update private.bg_keys set last_used = now() where dev = ${dev}`;
  // saved = the server now holds what the phone sent (fields the server owns may differ)
  const by: Record<string, any> = {}; for (const g of got) by[g.id] = g;
  const okIds: string[] = [], refused: string[] = [];
  for (const x of send) {
    const g = by[x.id]; const sent = x.full || x.patch || {};
    const same = g && !g.deleted && g.data && Object.keys(sent).every((f) => SERVER.has(f) || canon(g.data[f]) === canon(sent[f]))
      && (x.unset || []).every((f: string) => SERVER.has(f) || !(f in g.data));
    (same ? okIds : refused).push(x.id);
  }
  return json({ ok: okIds, refused, skipped: skip });
}
if (!(globalThis as any).__PS_TEST) Deno.serve(handle);
