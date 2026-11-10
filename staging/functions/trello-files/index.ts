import { createClient } from "jsr:@supabase/supabase-js@2";
// trello-files — Baruch 2026-11-04: "I have much more files in Trello by every job. I don't see it coming in." + "I want to
// be able to open it on the app."  (Baruch chose: ACTIVE jobs only — Upcoming, Confirmed, Roughing, Rough Complete, Finishing.)
//  • POST {"count":true}  → how many Trello files each active job would get (writes nothing)
//  • POST {} (cron, every 10 min) → brings new Trello attachments into their job's Files. Photos are copied into the app's
//    photo storage (they show like any job photo); PDFs and other files stay in Trello and open through ?file= below.
//    A file deleted in the app (data.trelloAttGone) never comes back. Adds go through public.trello_add_files (one locked step).
//  • POST ?upload=1&site=<job id> (signed in, office) → puts a document added in the app onto the job's Trello card.
//  • GET ?file=<trello attachment url>&site=<job id> (signed in) → the file itself, for the app's PDF reader. Only for people who
//    may see that job's file (owner, managers, office, material, the person who added it, or people it was shared with).
// POST modes run only for the database cron secret (x-push-secret) or a signed-in owner / manager / office person.
//
// v4 — Baruch 11/9 "plans must open almost instantly, without paying for storage we don't need":
//  • ?file= no longer asks Trello for the file details first (one trip less); the download goes straight to Trello.
//  • A SHORT-TERM copy of opened plans is kept in the private 'plancache' bucket (capped, oldest-used removed first), so the
//    next person gets it from our storage instead of Trello. The original always stays on Trello.
//  • POST ?resolve=1 {items:[{site,tid}]} → for the plans this person may see: short-lived links to the kept copy and to the
//    first-page preview / thumbnail, when we have them.
//  • POST ?preview=1&site=&tid= {pv,th} (JPEG data) → saves the first-page preview + thumbnail a phone made (small images).
//  • The bucket is private: nothing in it can be opened without a link from this function (same permission check as ?file=).
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ACTIVE = new Set(["upcoming", "ready", "active", "roughdone", "inspection", "priced"]);
const CACHE_BUCKET = "plancache";
const CACHE_CAP = 150 * 1048576;        // kept copies of opened plans: at most 150 MB in total (oldest-used removed first)
const CACHE_MAX_FILE = 25 * 1048576;    // a single plan bigger than this is never kept
const LINK_SECS = 3600;                 // links handed to the phone work for 1 hour
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-push-secret, x-file-name", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Expose-Headers": "x-plan-src, content-length" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
const shortLink = (u: unknown): string | null => { const m = String(u ?? "").match(/\/c\/([A-Za-z0-9]+)/); return m ? m[1] : null; };
const attId = (u: unknown): string | null => { const m = String(u ?? "").match(/\/attachments\/([0-9a-f]{24})/); return m ? m[1] : null; };
const kindOf = (mime: string, name: string) => /^image\//.test(mime) || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name) ? "img"
  : /pdf/.test(mime) || /\.pdf$/i.test(name) ? "pdf" : /word|msword/.test(mime) || /\.docx?$/i.test(name) ? "doc"
  : /sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name) ? "sheet" : "file";
const TID = /^[0-9a-f]{24}$/;
// deno-lint-ignore no-explicit-any
const waitUntil = (p: Promise<unknown>) => { try { (globalThis as any).EdgeRuntime?.waitUntil(p); } catch (_) { /* runs anyway */ } };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = new URL(req.url);
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  const { data: cfgRows } = await sb.from("server_config").select("k,v");
  const cfg: Record<string, string> = {}; for (const r of cfgRows || []) cfg[r.k] = r.v;
  const KEY = cfg["trello_key"], TOKEN = cfg["trello_token"], BOARD = cfg["trello_board"], SECRET = cfg["secret"] || "";
  const V2 = (cfg["plans_v2"] || "on") !== "off";   // server switch for the fast-plans pilot (off = everything works exactly as before)
  const BASE = (cfg["trello_sync_api_base"] || "https://api.trello.com/1").replace(/\/$/, "");
  if (!KEY || !TOKEN || !BOARD) return json({ error: "trello config missing" }, 500);
  const oauth = { Authorization: `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"` };
  const me = async () => {
    if (!ANON) return null;
    const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: req.headers.get("authorization") || "" } }, auth: { persistSession: false } });
    const { data } = await user.rpc("my_emp_data"); return data && data.id ? data : null;
  };
  // the same rule as before for every plan action: staff, the person who added it, or people / crews it was shared with
  // deno-lint-ignore no-explicit-any
  const allowed = (m: any, f: any) => {
    const staff = ["owner", "manager", "office"].includes(m.role) || !!m.all;
    const shared = f.by === m.id || (Array.isArray(f.share) && f.share.some((x: string) => x === m.id || (m.crew && x === m.crew)));
    return staff || shared;
  };
  // deno-lint-ignore no-explicit-any
  const siteFiles = async (ids: string[]): Promise<Record<string, any[]>> => {
    const out: Record<string, any[]> = {}; if (!ids.length) return out;
    const { data } = await sb.from("records").select("id,data").eq("coll", "sites").eq("deleted", false).in("id", ids.slice(0, 300));
    for (const r of data || []) out[r.id] = Array.isArray(r.data?.files) ? r.data.files : [];
    return out;
  };
  // deno-lint-ignore no-explicit-any
  const findFile = (files: any[], tid: string) => files.find((x) => (x?.tid || attId(x?.url)) === tid);
  const hit = (tid: string) => sb.rpc("plancache_hit", { p_tid: tid }).then(() => {}, () => {});

  // ---------- open one Trello file for the app ----------
  if (req.method === "GET" && url.searchParams.get("file")) {
    const m = await me(); if (!m) return json({ error: "sign in" }, 401);
    const fileUrl = url.searchParams.get("file") || ""; const siteId = url.searchParams.get("site") || "";
    const cm = fileUrl.match(/^https:\/\/(?:api\.)?trello\.com\/1\/cards\/([0-9a-f]{24})\/attachments\/([0-9a-f]{24})/);
    if (!cm) return json({ error: "not a Trello file" }, 400);
    const f = findFile((await siteFiles([siteId]))[siteId] || [], cm[2]);
    if (!f) return json({ error: "not this job's file" }, 404);
    if (!allowed(m, f)) return json({ error: "not allowed" }, 403);
    const tid = cm[2];
    const pilot = V2 && url.searchParams.get("pc") === "1";   // only the fast-plans pilot uses the kept copies
    // 1) our short-term copy, if someone opened this plan recently
    const kept = pilot ? await sb.storage.from(CACHE_BUCKET).download(`pdf/${tid}.pdf`) : { error: true, data: null };
    if (pilot && !kept.error && kept.data && kept.data.size) {
      waitUntil(hit(tid));
      return new Response(kept.data, { status: 200, headers: { "Content-Type": "application/pdf", "Content-Length": String(kept.data.size), "Cache-Control": "private, max-age=3600", "x-plan-src": "kept", ...CORS } });
    }
    // 2) straight from Trello (the saved link IS the download link — no extra "file details" trip); old links fall back
    // (pilot) the saved link IS the download link — one Trello trip; everyone else: exactly as before (details, then download)
    let dl: Response = pilot ? await fetch(String(f.url || fileUrl), { headers: oauth }) : new Response(null, { status: 599 });
    let type = dl.headers.get("content-type") || "";
    if (!dl.ok || !dl.body) {
      const meta = await fetch(`${BASE}/cards/${cm[1]}/attachments/${tid}?` + new URLSearchParams({ key: KEY, token: TOKEN, fields: "url,mimeType,name" }));
      if (!meta.ok) return json({ error: "trello " + meta.status }, 502);
      const a = await meta.json(); dl = await fetch(a.url, { headers: oauth }); type = a.mimeType || dl.headers.get("content-type") || "";
      if (!dl.ok || !dl.body) return json({ error: "download " + dl.status }, 502);
    }
    if (!type || /octet-stream/.test(type)) type = /\.pdf$/i.test(String(f.name || "")) || f.kind === "pdf" ? "application/pdf" : (f.mime || "application/octet-stream");
    const len = +(dl.headers.get("content-length") || 0);
    const isPdf = /pdf/i.test(type);
    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "private, max-age=3600", "x-plan-src": "trello", ...CORS };
    if (len) headers["Content-Length"] = String(len);
    // 3) keep a short-term copy of PDFs while sending (the phone does not wait for this)
    if (pilot && isPdf && (!len || len <= CACHE_MAX_FILE)) {
      const [toPhone, toKeep] = dl.body.tee();
      waitUntil((async () => {
        const buf = await new Response(toKeep).arrayBuffer();
        if (!buf.byteLength || buf.byteLength > CACHE_MAX_FILE) return;
        const up = await sb.storage.from(CACHE_BUCKET).upload(`pdf/${tid}.pdf`, new Blob([buf], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
        if (up.error) return;
        await sb.rpc("plancache_put", { p_tid: tid, p_bytes: buf.byteLength });
        const { data: drop } = await sb.rpc("plancache_over", { p_cap: CACHE_CAP });
        const names = (drop || []).map((x: { tid: string }) => `pdf/${x.tid}.pdf`);
        if (names.length) { await sb.storage.from(CACHE_BUCKET).remove(names); await sb.rpc("plancache_forget", { p_tids: (drop || []).map((x: { tid: string }) => x.tid) }); }
      })().catch(() => {}));
      return new Response(toPhone, { status: 200, headers });
    }
    return new Response(dl.body, { status: 200, headers });
  }

  // ---------- links to kept copies / previews for the plans this person may see ----------
  if (req.method === "POST" && url.searchParams.get("resolve") === "1") {
    if (!V2) return json({ plans: {}, off: true });
    const m = await me(); if (!m) return json({ error: "sign in" }, 401);
    let body: { items?: { site: string; tid: string }[] } = {}; try { body = await req.json(); } catch (_) { /* empty */ }
    const items = (Array.isArray(body.items) ? body.items : []).filter((x) => x && typeof x.site === "string" && TID.test(String(x.tid))).slice(0, 300);
    const files = await siteFiles([...new Set(items.map((x) => x.site))]);
    const ok = items.filter((x) => { const f = findFile(files[x.site] || [], x.tid); return !!f && allowed(m, f); });
    const tids = [...new Set(ok.map((x) => x.tid))];
    const { data: have } = await sb.rpc("plancache_have", { p_tids: tids });
    const paths: string[] = [];
    const H = new Set<string>((have || []).map((x: { name: string }) => x.name));
    for (const t of tids) for (const p of [`pdf/${t}.pdf`, `pv/${t}.jpg`, `th/${t}.jpg`]) if (H.has(p)) paths.push(p);
    const out: Record<string, { pdf?: string; pv?: string; th?: string }> = {};
    for (const t of tids) out[t] = {};
    if (paths.length) {
      const { data: signed } = await sb.storage.from(CACHE_BUCKET).createSignedUrls(paths, LINK_SECS);
      for (const s of signed || []) {
        if (!s.signedUrl || !s.path) continue;
        const [kind, file] = s.path.split("/"); const t = file.replace(/\.(pdf|jpg)$/, "");
        if (!out[t]) continue;
        if (kind === "pdf") out[t].pdf = s.signedUrl; else if (kind === "pv") out[t].pv = s.signedUrl; else if (kind === "th") out[t].th = s.signedUrl;
      }
    }
    return json({ plans: out, at: Date.now() });
  }

  // ---------- a phone made the first-page preview + thumbnail of a plan: keep them (small images) ----------
  if (req.method === "POST" && url.searchParams.get("preview") === "1") {
    if (!V2) return json({ error: "off" }, 404);
    const m = await me(); if (!m) return json({ error: "sign in" }, 401);
    const siteId = url.searchParams.get("site") || ""; const tid = url.searchParams.get("tid") || "";
    if (!TID.test(tid)) return json({ error: "bad plan" }, 400);
    const f = findFile((await siteFiles([siteId]))[siteId] || [], tid);
    if (!f) return json({ error: "not this job's file" }, 404);
    if (!allowed(m, f)) return json({ error: "not allowed" }, 403);
    let body: { pv?: string; th?: string } = {}; try { body = await req.json(); } catch (_) { /* empty */ }
    const dec = (s?: string) => { const b = String(s || "").replace(/^data:image\/jpeg;base64,/, ""); if (!b || b.length > 1_200_000) return null; try { return Uint8Array.from(atob(b), (c) => c.charCodeAt(0)); } catch (_) { return null; } };
    const pv = dec(body.pv), th = dec(body.th);
    if (!pv || !th || pv[0] !== 0xff || th[0] !== 0xff) return json({ error: "bad images" }, 400);
    const a = await sb.storage.from(CACHE_BUCKET).upload(`pv/${tid}.jpg`, new Blob([pv], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
    const b = await sb.storage.from(CACHE_BUCKET).upload(`th/${tid}.jpg`, new Blob([th], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true });
    if (a.error || b.error) return json({ error: "save failed" }, 500);
    return json({ ok: true, bytes: pv.byteLength + th.byteLength });
  }

  // ---------- pilot measurements (opening times, sizes, where the plan came from) for Baruch's report ----------
  if (req.method === "POST" && url.searchParams.get("log") === "1") {
    const m = await me(); if (!m) return json({ error: "sign in" }, 401);
    let body: { kind?: string; data?: unknown } = {}; try { body = await req.json(); } catch (_) { /* empty */ }
    const txt = JSON.stringify(body.data ?? {}); if (txt.length > 4000) return json({ error: "too big" }, 413);
    await sb.rpc("plancache_log", { p_who: m.id, p_kind: String(body.kind || "").slice(0, 20), p_data: JSON.parse(txt) });
    return json({ ok: true });
  }

  // ---------- a document added in the app goes onto the job's Trello card (Baruch 11/4: "stored in Trello, opens in our app") ----------
  // POST ?upload=1&site=<job id>, body = the file, header x-file-name. Returns the Trello attachment for the app to link to.
  if (req.method === "POST" && url.searchParams.get("upload") === "1") {
    const m = await me(); if (!m) return json({ error: "sign in" }, 401);
    if (!(["owner", "manager", "office"].includes(m.role) || m.all)) return json({ error: "not allowed" }, 403);
    const siteId = url.searchParams.get("site") || "";
    const { data: srow } = await sb.from("records").select("data").eq("coll", "sites").eq("id", siteId).eq("deleted", false).maybeSingle();
    const sl = shortLink(srow?.data?.trello); if (!sl) return json({ error: "no Trello card" }, 409);
    let raw = req.headers.get("x-file-name") || "file"; try { raw = decodeURIComponent(raw); } catch (_) { /* keep */ }
    const name = raw.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "file";
    const type = req.headers.get("content-type") || "application/octet-stream";
    const blob = await req.blob();
    if (!blob.size) return json({ error: "empty file" }, 400);
    if (blob.size > 10 * 1048576) return json({ error: "over 10 MB" }, 413);
    const fd = new FormData(); fd.append("file", new File([blob], name, { type })); fd.append("name", name); fd.append("mimeType", type);
    const up = await fetch(`${BASE}/cards/${sl}/attachments?` + new URLSearchParams({ key: KEY, token: TOKEN }), { method: "POST", body: fd });
    if (!up.ok) return json({ error: "trello " + up.status, detail: (await up.text()).slice(0, 120) }, 502);
    const a = await up.json();
    if (!a || !a.id || !a.url) return json({ error: "trello answer" }, 502);
    return json({ tid: a.id, url: a.url, name: a.name || name, mime: a.mimeType || type, bytes: +a.bytes || blob.size, date: a.date || null });
  }

  // ---------- count / bring in (cron or office) ----------
  const got = req.headers.get("x-push-secret") || "";
  if (!(SECRET && got === SECRET)) { const m = await me(); if (!m || !["owner", "manager", "office"].includes(m.role)) return json({ error: "forbidden" }, 403); }
  // deno-lint-ignore no-explicit-any
  let body: any = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  const countOnly = !!body.count;

  const q = new URLSearchParams({ key: KEY, token: TOKEN, fields: "name,shortLink,closed", attachments: "true", attachment_fields: "id,name,url,mimeType,bytes,date,isUpload,fileName" });
  const r = await fetch(`${BASE}/boards/${BOARD}/cards?${q}`);
  if (!r.ok) return json({ error: "trello " + r.status }, 502);
  // deno-lint-ignore no-explicit-any
  const cards: any[] = await r.json();
  // deno-lint-ignore no-explicit-any
  const sites: { id: string; data: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb.from("records").select("id,data").eq("coll", "sites").eq("deleted", false).order("id").range(from, from + 999);
    if (error) throw error; sites.push(...(page || [])); if (!page || page.length < 1000) break;
  }
  // deno-lint-ignore no-explicit-any
  const bySL: Record<string, { id: string; data: any }> = {};
  for (const s of sites) { const sl = shortLink(s.data?.trello); if (sl) bySL[sl] = s; }

  const started = Date.now(); let imgBudget = 30;   // photos are copied: at most 30 per run (the rest next run)
  // deno-lint-ignore no-explicit-any
  const out: any[] = []; let added = 0, photos = 0, waiting = 0, failed = 0;
  for (const c of cards) {
    if (c.closed || !(c.attachments || []).length) continue;
    const s = bySL[c.shortLink]; if (!s) continue;
    const d = s.data || {}; if (!ACTIVE.has(d.stage || "active")) continue;
    const have = new Set<string>();
    for (const f of (Array.isArray(d.files) ? d.files : [])) { const a = f?.tid || attId(f?.url); if (a) have.add(a); }
    for (const g of (Array.isArray(d.trelloAttGone) ? d.trelloAttGone : [])) have.add(g);
    // deno-lint-ignore no-explicit-any
    const add: any[] = [];
    for (const a of c.attachments) {
      if (!a.isUpload || have.has(a.id)) continue;
      const name = String(a.name || a.fileName || "file"); const kind = kindOf(String(a.mimeType || ""), name);
      const ts = Date.parse(a.date) || Date.now();
      if (countOnly) { add.push({ name, kind }); continue; }
      if (Date.now() - started > 110000) { waiting++; continue; }
      if (kind === "img") {
        if (imgBudget <= 0) { waiting++; continue; }
        imgBudget--;
        try {
          const dl = await fetch(a.url, { headers: oauth }); if (!dl.ok) throw new Error("download " + dl.status);
          const blob = await dl.blob(); const type = a.mimeType || blob.type || "image/jpeg";
          const ext = (type.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
          const path = `trello/${s.id}/${a.id}.${ext}`;
          const up = await sb.storage.from("files").upload(path, blob, { contentType: type, upsert: true }); if (up.error) throw up.error;
          const pub = sb.storage.from("files").getPublicUrl(path).data.publicUrl;
          add.push({ id: "ft" + a.id, tid: a.id, name, kind, d: pub, by: "trello", ts }); photos++;
        } catch (_) { failed++; }
      } else add.push({ id: "ft" + a.id, tid: a.id, name, kind, url: a.url, mime: a.mimeType || "", bytes: +a.bytes || 0, by: "trello", ts });
    }
    if (!add.length) continue;
    if (countOnly) { out.push({ job: d.name, stage: d.stage, files: add.length }); added += add.length; continue; }
    const { data: n, error } = await sb.rpc("trello_add_files", { p_site: s.id, p_files: add });
    if (error) { failed += add.length; continue; }
    added += +n || 0; if (n) out.push({ job: d.name, added: n });
  }
  // fast-plans storage stays small: previews and kept copies of plans that are no longer on an active job are removed
  let cleaned = 0;
  if (!countOnly) {
    const { data: gone } = await sb.rpc("plancache_orphans", { p_stages: [...ACTIVE] });
    const names = (gone || []).map((x: { name: string }) => x.name).slice(0, 500);
    if (names.length) { const rm = await sb.storage.from(CACHE_BUCKET).remove(names); if (!rm.error) { cleaned = names.length;
      const tids = names.filter((n: string) => n.startsWith("pdf/")).map((n: string) => n.slice(4, 28)); if (tids.length) await sb.rpc("plancache_forget", { p_tids: tids }); } }
  }
  return json({ countOnly, added, photosCopied: photos, waitingForNextRun: waiting, failed, jobs: out.length, list: out.slice(0, 60), plansCleaned: cleaned });
});
