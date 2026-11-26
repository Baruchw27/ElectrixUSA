// Supabase Edge Function "trello-personal": a person's OWN Trello (all their open boards) ⇄ their private Tasks page.
// Separate from "trello-sync" (Shia's General Overview board → Jobs), which is not touched.
//   • every 5 minutes (database cron, x-push-secret) for everyone connected, or on demand by a signed-in person (themselves)
//   • first sends what changed in the app (push:true): text, note, done (→ Trello "due complete"), due date, new tasks
//   • then brings in every open card of every open board the person is a member of → records coll 'ptask' (owner = them)
//   • a card that is archived or no longer on their boards is marked gone (kept in history, never deleted)
// The person's Trello access code is in server_config 'trello_user_token:<emp>' — server only, never sent to a phone.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" } });
const DONE_LIST = /^\s*(done|complete|completed|finished|terminado|listo)\b/i;
// JSON text that ignores object key order (the database stores keys in its own order)
const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as any)[k])).join(",")}}` : JSON.stringify(v ?? null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfgRows } = await adm.from("server_config").select("k,v");
  const cfg: Record<string, string> = {}; for (const r of cfgRows || []) if (["secret", "trello_key", "trello_api_base"].includes(r.k) || r.k.startsWith("trello_user_token:")) cfg[r.k] = r.v;
  let only: string | null = null;
  if (!(cfg.secret && req.headers.get("x-push-secret") === cfg.secret)) {
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("authorization") || "" } }, auth: { persistSession: false } });
    const { data: me } = await user.rpc("my_emp_data");
    if (!me || !me.id) return json({ error: "sign in first" }, 403);
    only = me.id;
  }
  const KEY = cfg.trello_key; const BASE = (cfg.trello_api_base || "https://api.trello.com/1").replace(/\/$/, "");
  if (!KEY) return json({ error: "trello key missing" }, 500);
  const people = Object.keys(cfg).filter((k) => k.startsWith("trello_user_token:")).map((k) => k.slice("trello_user_token:".length)).filter((e) => !only || e === only);
  const out: unknown[] = [];
  for (const emp of people) {
    try { out.push(await syncOne(adm, emp, cfg["trello_user_token:" + emp], KEY, BASE)); }
    catch (e) { out.push({ emp, error: String((e as Error).message || e).slice(0, 300) }); }
  }
  return json({ ok: true, synced: out });
});

async function syncOne(adm: any, emp: string, token: string, KEY: string, BASE: string) {
  const T = async (method: string, path: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...params, key: KEY, token });
    const r = await fetch(`${BASE}/${path}?${q}`, { method });
    const txt = await r.text();
    if (r.status === 401) throw new Error("Trello says the access code is no longer valid (401) — reconnect");
    if (!r.ok) throw new Error(`Trello ${method} ${path} → ${r.status} ${txt.slice(0, 120)}`);
    return txt ? JSON.parse(txt) : null;
  };
  // read ALL of this person's cards (the database answers at most 1000 rows per request — page through them)
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await adm.from("records").select("id,data").eq("coll", "ptask").eq("deleted", false).eq("data->>owner", emp).order("id").range(from, from + 999);
    if (error) throw error;
    rows.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  const mine: { id: string; data: any }[] = rows.filter((r: any) => r.data && !r.data.meta);
  const now = Date.now(); const ups: any[] = []; let pushed = 0, pushErr = 0;
  // 1) app → Trello
  for (const r of mine.filter((x) => x.data.push === true)) {
    const d = r.data;
    try {
      const p: Record<string, string> = { name: String(d.t || "").slice(0, 500), desc: String(d.desc || ""), dueComplete: d.done ? "true" : "false" };
      p.due = d.due ? String(d.due) : "null";
      let c: any; let idList = String(d.list || ""); let listName = d.listName;
      // T2: a card for a job that has no list yet on job Name's → use the list with that name, or make it
      if (!d.card && !idList && d.newList && d.board) {
        const want = String(d.newList).trim().toLowerCase();
        const ls = await T("GET", `boards/${d.board}/lists`, { filter: "open", fields: "name" });
        let l = (ls || []).find((x: any) => String(x.name || "").trim().toLowerCase() === want);
        if (!l) l = await T("POST", "lists", { name: String(d.newList).slice(0, 200), idBoard: String(d.board), pos: "bottom" });
        idList = l.id; listName = l.name;
      }
      if (d.card) c = await T("PUT", `cards/${d.card}`, d.mv && idList ? { ...p, idList, ...(d.board ? { idBoard: String(d.board) } : {}) } : p);   // T2: mv = moved to another list (any of his boards) in the app
      else c = await T("POST", "cards", { ...p, idList });
      r.data = { ...d, id: r.id, card: c.id, list: idList || d.list, listName, url: c.shortUrl || d.url, act: c.dateLastActivity || d.act, push: false, pushedAt: now };
      delete r.data.pushErr; delete r.data.mv; delete r.data.newList; ups.push({ coll: "ptask", id: r.id, data: r.data, deleted: false }); pushed++;
    } catch (e) {
      r.data = { ...d, pushErr: String((e as Error).message).slice(0, 200) }; ups.push({ coll: "ptask", id: r.id, data: r.data, deleted: false }); pushErr++;
    }
  }
  // 2) Trello → app
  const byCard: Record<string, { id: string; data: any }> = {}; for (const r of mine) if (r.data.card) byCard[r.data.card] = r;
  const boards = await T("GET", "members/me/boards", { filter: "open", fields: "name,url,closed" });
  const seen = new Set<string>(); const meta: any[] = []; let cardsN = 0;
  for (const b of boards || []) {
    if (b.closed) continue;
    const lists = await T("GET", `boards/${b.id}/lists`, { filter: "open", fields: "name,closed,pos" });
    const ln: Record<string, string> = {}; for (const l of lists || []) ln[l.id] = l.name;
    meta.push({ id: b.id, name: b.name, url: b.url, lists: (lists || []).filter((l: any) => !l.closed).map((l: any) => ({ id: l.id, name: l.name })) });
    const cards = await T("GET", `boards/${b.id}/cards`, { filter: "open", fields: "name,desc,idList,start,due,dueComplete,labels,shortUrl,dateLastActivity,closed" });
    for (const c of cards || []) {
      if (c.closed) continue; seen.add(c.id); cardsN++;
      const ex = byCard[c.id]; if (ex && ex.data.push === true) continue;            // a change from the app still waiting to go out
      const listName = ln[c.idList] || "";
      const id = ex ? ex.id : `pt_${emp}_${c.id}`;
      const nd = { ...(ex ? ex.data : {}), id, owner: emp, card: c.id, t: c.name || "", desc: c.desc || "", board: b.id, boardName: b.name, list: c.idList, listName,
        start: c.start || null, labels: (c.labels || []).map((l: any) => String(l.name || l.color || "")).filter(Boolean),
        due: c.due || null, done: !!c.dueComplete || DONE_LIST.test(listName), url: c.shortUrl || null, act: c.dateLastActivity || null, gone: false };
      delete (nd as any).push;
      if (!ex || JSON.stringify(ex.data) !== JSON.stringify(nd)) ups.push({ coll: "ptask", id, data: nd, deleted: false });
    }
  }
  // 3) archived / no longer on his boards → gone (never deleted)
  let gone = 0;
  for (const r of mine) if (r.data.card && !seen.has(r.data.card) && !r.data.gone && r.data.push !== true) { ups.push({ coll: "ptask", id: r.id, data: { ...r.data, id: r.id, gone: true, goneAt: now }, deleted: false }); gone++; }
  // boards and lists (for "add a task" in the app): rewritten only when they really changed (2026-11-25: rewriting this
  // ~7 KB record every 5 minutes just to move its clock made ~4 MB of change history a day).
  const metaId = `ptmeta_${emp}`, syncId = `ptsync_${emp}`;
  const prevMeta = rows.find((r: any) => r.id === metaId)?.data;
  if (!prevMeta || canon(prevMeta.boards) !== canon(meta)) ups.push({ coll: "ptask", id: metaId, data: { id: metaId, owner: emp, meta: true, boards: meta, syncedAt: now }, deleted: false });
  // "Last synced" lives in its own small record (meta:true, so every task list skips it, like ptmeta).
  ups.push({ coll: "ptask", id: syncId, data: { id: syncId, owner: emp, meta: true, syncedAt: now }, deleted: false });
  const last: Record<string, any> = {};
  for (const u of ups) last[u.id] = { ...u, updated_by: "trello-personal" };          // one write per record; history names the writer
  const list = Object.values(last);
  for (let i = 0; i < list.length; i += 200) { const { error } = await adm.from("records").upsert(list.slice(i, i + 200), { onConflict: "coll,id" }); if (error) throw error; }
  return { emp, boards: meta.length, cards: cardsN, written: list.filter((u: any) => u.id !== metaId && u.id !== syncId).length, pushed, pushErr, gone };
}
