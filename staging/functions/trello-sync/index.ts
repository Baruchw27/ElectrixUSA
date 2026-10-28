import { createClient } from "jsr:@supabase/supabase-js@2";
// Shia's "General Overview" board ⇄ Jobs (sites).
//  S1 (2026-10-21): keeps each job's place on the board (tlpos = which list, left to right; tpos = the card's place in
//  that list) so the app shows jobs in Shia's order; reads ALL jobs (the database answers at most 1000 rows per request).
//  T4 (Baruch 2026-10-22 02:10, two-way): a job moved in the app (data.tmove = {list, name, at, by}) is moved to that
//  list on Shia's board FIRST; while such a move is waiting it is never undone by the board. The board's lists (name,
//  section) are published to the app as records '_' / 'trelloLists' so the app can offer Shia's exact lists.
//  Baruch 02:24: the app moves a job to Roughing → "In Progress", Finishing → "Roughing Done", Complete → "Job is Completed".
//  2026-10-27: the list → folder map in use is server_config 'trello_map' (Rough Complete = "Roughing Done" + "Inspection Passed").
//  N1 (Baruch 2026-10-27): a card RENAMED in Trello renames the job in the app. The last Trello name seen is kept as
//  data.tname, so a name changed in the app stays until the card is renamed again in Trello. A phone number at the end
//  of a card name ("… +1 (845) 555-1234") is not part of the job's name (it goes to the job's phone if that is empty);
//  trailing dots/commas and upper/lower case don't count as a rename.
//  A1 (Baruch 2026-10-27): a card ARCHIVED or DELETED in Trello hides its job in the app (stage "lost", like lost bids;
//  tgone = true, the folder it was in kept as stageBeforeGone). Nothing is erased; if the card comes back on the board the
//  job comes back with it. Safety: if Trello answers with far fewer cards than the app has jobs for (a bad or partial
//  answer), or more than 15 jobs would be hidden at once, nothing is hidden — it is only reported (goneHeld).
//  M1 (Baruch 2026-10-27 23:24, duplicates kept coming back): (a) a new job made from a card now carries its own id inside
//  (without it every phone saved the job again as a new copy); (b) a card whose job was merged into another one
//  ("Same job — merge", data.mergedTrello on the hidden copy) is never brought back as a new job.
//  2026-10-28 audit (H11/H12/H13/M07): W1 writes only the fields this run changed, merged on the server
//  (trello_apply_sites) — a phone's change made while the sync was running is never overwritten, and a move made in the
//  app meanwhile is kept; R1 a job removed in the app is never brought back by its card; L1 a job made in the app is
//  linked to the card with the same address (exactly one match) instead of a second copy; M7 an old "not moved in
//  Trello" warning is cleared once the job follows the board again, and the app is told when the board was last read.
//  Runs every 5 minutes (database cron, x-push-secret) and on demand by a signed-in owner / manager / office person.

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";

const DEFAULT_MAP: Record<string, { stage: string; phase?: string }> = {
  "Lead": { stage: "upcoming" }, "Upcoming": { stage: "upcoming" },
  "Lost Bids": { stage: "lost" },   // Baruch 2026-10-22: lost bids are not wanted in the app — new ones are not brought in, ones already in are hidden (kept)
  "Lighting Planing": { stage: "upcoming" }, "TBD": { stage: "upcoming" },
  "Something Else": { stage: "upcoming" },
  "To Price": { stage: "upcoming" }, "Submitted Price To Costumer": { stage: "upcoming" },
  "Prepper License": { stage: "ready" }, "Summited License": { stage: "ready" },
  "O&R": { stage: "ready" }, "Deposit Received": { stage: "ready" },
  "Waiting For Founds": { stage: "ready" },
  "Ready To Start Roughing": { stage: "ready", phase: "rough" },
  "In Progress": { stage: "active", phase: "rough" },
  "Waiting To Fix Roughing": { stage: "active", phase: "rough" },
  "Prepper Inspection": { stage: "active", phase: "rough" },
  "Roughing Done": { stage: "roughdone", phase: "rough" },       // Baruch 2026-10-27: Rough Complete folder
  "Inspection Passed": { stage: "roughdone", phase: "rough" },   // Baruch 2026-10-27: Rough Complete folder
  "Ready To Make Finishing": { stage: "inspection", phase: "finish" },
  "Finishing In Progress": { stage: "inspection", phase: "finish" },
  "Add Ons": { stage: "inspection", phase: "finish" },
  "Done Finishing": { stage: "done", phase: "finish" },
  "Invoiced": { stage: "inspection", phase: "finish" },   // Baruch 2026-10-22: Invoiced jobs belong with Finishing, not Complete
  "Invoice Updated": { stage: "done" },
  "Job is Completed": { stage: "done" },
};

// N1: card name → job name (+ phone at the end, if any)
const PHONE_TAIL = /[\s.,;:-]*(\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}\s*$/;
function splitName(raw: unknown): { name: string; phone: string } {
  const s = String(raw ?? "").trim(); const m = s.match(PHONE_TAIL);
  if (!m || m.index === undefined) return { name: s.replace(/[\s.,;:]+$/, ""), phone: "" };
  return { name: s.slice(0, m.index).replace(/[\s.,;:]+$/, "").trim(), phone: m[0].replace(/^[\s.,;:-]+/, "").trim() };
}
const normName = (x: unknown) => String(x ?? "").toLowerCase().replace(/[\s.,;:]+$/, "").replace(/\s+/g, " ").trim();
// what changes on an existing job: follow Trello only when the Trello name itself changed
function nameUpdate(d: any, cardName: unknown): Record<string, string> | null {
  const t = splitName(cardName); if (!t.name) return null;
  const last = d.tname;
  const changedInTrello = last === undefined ? normName(d.name) !== normName(t.name) : normName(last) !== normName(t.name);
  const out: Record<string, string> = {};
  if (last !== t.name) out.tname = t.name;
  if (changedInTrello && normName(d.name) !== normName(t.name)) out.name = t.name;
  if (out.name && t.phone && !d.phone) out.phone = t.phone;
  return Object.keys(out).length ? out : null;
}

const shortLinkFromUrl = (u: unknown): string | null => {
  const m = String(u ?? "").match(/\/c\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-push-secret" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const { data: cfgRows } = await sb.from("server_config").select("k,v");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows || []) cfg[r.k] = r.v;
  const KEY = cfg["trello_key"], TOKEN = cfg["trello_token"], BOARD = cfg["trello_board"];
  const BASE = (cfg["trello_sync_api_base"] || "https://api.trello.com/1").replace(/\/$/, "");   // (trello_api_base is the staging fake Trello for trello-personal — not used here)
  const SECRET = cfg["secret"] || "";
  const WRITE = (cfg["trello_write"] || "on") !== "off";            // "off" = moves are only reported, Trello is not changed
  const skip = new Set((cfg["trello_skip_lists"] || "Lead,Lost Bids").split(",").map((s) => s.trim()).filter(Boolean));
  let MAP = DEFAULT_MAP;
  try { if (cfg["trello_map"]) MAP = JSON.parse(cfg["trello_map"]); } catch (_) {}

  // who may run it: the cron (secret), or a signed-in owner / manager / office person (right after moving a job)
  const got = req.headers.get("x-push-secret") || url.searchParams.get("secret") || "";
  if (!(SECRET && got === SECRET)) {
    if (!ANON) return json({ error: "forbidden" }, 403);
    const user = createClient(SB_URL, ANON, { global: { headers: { Authorization: req.headers.get("authorization") || "" } }, auth: { persistSession: false } });
    const { data: me } = await user.rpc("my_emp_data");
    if (!me || !me.id || !["owner", "manager", "office"].includes(me.role)) return json({ error: "forbidden" }, 403);
  }
  if (!KEY || !TOKEN || !BOARD) return json({ error: "trello config missing" }, 500);

  const trello = async (method: string, path: string, params: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...params, key: KEY, token: TOKEN });
    const r = await fetch(`${BASE}/${path}?${q}`, { method });
    const txt = await r.text();
    if (!r.ok) { const e: any = new Error(`trello ${method} ${path.split("?")[0].split(TOKEN).join("[token]")} -> ${r.status} ${txt.slice(0, 120).split(TOKEN).join("[token]")}`); e.status = r.status; throw e; }
    return txt ? JSON.parse(txt) : null;
  };
  const mapFor = (l: string) => MAP[l] || { stage: "upcoming" };
  // ?check=1 — can the Trello connection move cards on the board? (answers yes/no only; nothing is changed)
  if (url.searchParams.get("check") === "1") {
    const perms = await trello("GET", `tokens/${TOKEN}`, { fields: "permissions" });
    const ps = (perms?.permissions || []) as any[];
    const ok = (p: any) => p && p.write === true;
    const canWrite = ps.some((p) => (p.modelType === "Board" && (p.idModel === BOARD || p.idModel === "*") && ok(p)) || (p.modelType === "Member" && p.idModel === "*" && ok(p)) || (p.modelType === "Organization" && ok(p)));
    return json({ canWrite, write: WRITE });
  }

  const lists = await trello("GET", `boards/${BOARD}/lists`, { fields: "name,pos" });
  lists.sort((a: any, b: any) => (+a.pos || 0) - (+b.pos || 0));
  const listName: Record<string, string> = {}; const listIdx: Record<string, number> = {}; const listByName: Record<string, any> = {};
  lists.forEach((l: any, i: number) => { listName[l.id] = l.name; listIdx[l.id] = i; listByName[String(l.name).trim().toLowerCase()] = l; });

  const existing: { id: string; data: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb.from("records").select("id,data").eq("coll", "sites").eq("deleted", false).order("id").range(from, from + 999);
    if (error) throw error;
    existing.push(...(page || []));
    if (!page || page.length < 1000) break;
  }
  // W1 (2026-10-28): what the job looked like when this run read it — only the fields this run changes are written
  // back (trello_apply_sites merges them), so a phone's change made in the meantime (files, notes, a move) is kept.
  const orig: Record<string, any> = {};
  for (const r of existing) orig[r.id] = JSON.parse(JSON.stringify(r.data || {}));
  const bySL: Record<string, { id: string; data: any }> = {};
  for (const r of existing) { const sl = shortLinkFromUrl(r.data?.trello); if (sl) bySL[sl] = r; }
  // M1b: cards let go of by "Same job — merge" belong to the job they were merged into — never a new copy
  const mergedSL = new Set<string>();
  for (const r of existing) { const sl = shortLinkFromUrl(r.data?.mergedTrello); if (sl && !bySL[sl]) mergedSL.add(sl); }
  // R1 (H13): a job removed in the app (deleted, or "Remove site" → removedTrello) never comes back from its card
  const removedSL = new Set<string>();
  for (const r of existing) { const sl = shortLinkFromUrl(r.data?.removedTrello); if (sl && !bySL[sl]) removedSL.add(sl); }
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await sb.from("records").select("id,data").eq("coll", "sites").eq("deleted", true).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of page || []) { const sl = shortLinkFromUrl(r.data?.trello) || shortLinkFromUrl(r.data?.removedTrello); if (sl && !bySL[sl]) removedSL.add(sl); }
    if (!page || page.length < 1000) break;
  }
  // L1 (H12): a job made in the app (no card yet) is linked to the card with the same address instead of a second copy
  const firstPart = (x: unknown) => normName(String(x ?? "").split(",")[0]);
  const unlinked: Record<string, { id: string; data: any }[]> = {};
  for (const r of existing) { const d = r.data || {};
    if (shortLinkFromUrl(d.trello) || d.mergedInto || d.removed || d.stage === "lost" || !firstPart(d.name)) continue;
    (unlinked[firstPart(d.name)] = unlinked[firstPart(d.name)] || []).push(r); }
  let linkedByName = 0; const linkLog: string[] = [];
  const upserts: any[] = [];

  // 1) app → Shia's board: jobs moved in the app go to their new list first
  let moved = 0, moveErr = 0; const waiting = new Set<string>(); const moveLog: any[] = [];
  for (const r of existing) {
    const d = r.data || {}; const mv = d.tmove; if (!mv || typeof mv !== "object") continue;
    const sl = shortLinkFromUrl(d.trello);
    const l = (mv.list && listName[mv.list] !== undefined) ? { id: mv.list, name: listName[mv.list] } : listByName[String(mv.name || "").trim().toLowerCase()];
    const stale = +mv.at > 0 && Date.now() - +mv.at > 2 * 86400000;   // waited over 2 days (e.g. Trello refused): don't push an old move over newer board changes
    if (!sl || !l || stale) {   // no card, the list is gone, or too old: nothing to move — say so on the job (the board wins again)
      const nd = { ...d, tmoveErr: !sl ? "this job has no Trello card" : !l ? `the list "${mv.name || ""}" is not on the board any more` : "the move waited too long and was not made in Trello" };
      delete nd.tmove; upserts.push({ id: r.id, coll: "sites", data: nd, deleted: false }); r.data = nd; moveErr++; continue;
    }
    if (dry || !WRITE) { waiting.add(sl); moveLog.push({ job: d.name, to: l.name, done: false }); continue; }
    try {
      const c = await trello("PUT", `cards/${sl}`, { idList: l.id, pos: "top" });
      const m = mapFor(l.name);
      const nd: any = { ...d, stage: m.stage, trelloList: l.name, tlpos: listIdx[l.id] ?? null, tpos: typeof c?.pos === "number" ? c.pos : (+c?.pos || null), tmovedAt: Date.now() };
      if (m.phase) nd.phase = m.phase;
      delete nd.tmove; delete nd.tmoveErr;
      upserts.push({ id: r.id, coll: "sites", data: nd, deleted: false }); r.data = nd; moved++; moveLog.push({ job: d.name, to: l.name, done: true });
    } catch (e) {
      const st = (e as any).status;
      const msg = st === 401 ? "Trello did not allow the move (the Trello connection can only read)" : st === 404 ? "the Trello card was not found" : String((e as Error).message).slice(0, 160);
      const nd: any = { ...d, tmoveErr: msg };
      if (st === 404) delete nd.tmove;              // card gone: stop trying; otherwise keep it and try again next time
      else waiting.add(sl);
      upserts.push({ id: r.id, coll: "sites", data: nd, deleted: false }); r.data = nd; moveErr++; moveLog.push({ job: d.name, to: l.name, error: msg });
    }
  }

  // 2) Shia's board → app
  const cards = await trello("GET", `boards/${BOARD}/cards`, { fields: "name,idList,shortLink,shortUrl,closed,pos" });
  let created = 0, updated = 0, unchanged = 0, skipped = 0, held = 0, renamed = 0, skippedMerged = 0, skippedRemoved = 0;
  const newOnes: string[] = []; const renameLog: { from: string; to: string }[] = [];
  const openSL = new Set<string>();
  for (const c of cards) {
    if (c.closed) continue;
    const sl = c.shortLink; if (!sl) continue;
    openSL.add(sl);
    const lname = listName[c.idList] || "";
    let match = bySL[sl];
    if (!match && mergedSL.has(sl)) { skippedMerged++; continue; }   // M1b
    if (!match && removedSL.has(sl)) { skippedRemoved++; continue; }   // R1
    if (!match && !skip.has(lname)) {   // L1: exactly one unlinked app job with this address → link it to the card
      const cand = (unlinked[firstPart(splitName(c.name).name)] || []).filter((r) => !shortLinkFromUrl(r.data?.trello));
      if (cand.length === 1) {
        const r = cand[0]; const nd = { ...(r.data || {}), trello: c.shortUrl || ("https://trello.com/c/" + sl), tname: splitName(c.name).name || c.name };
        r.data = nd; bySL[sl] = r; match = r; linkedByName++; linkLog.push(String(nd.name || r.id));
        upserts.push({ id: r.id, coll: "sites", data: nd, deleted: false });
      }
    }
    // N1: the name follows Trello even while a list move from the app is waiting
    let nm: Record<string, string> | null = null;
    if (match) { nm = nameUpdate(match.data || {}, c.name); if (nm?.name) { renamed++; renameLog.push({ from: String(match.data?.name || ""), to: nm.name }); } }
    if (waiting.has(sl) || (match && (match.data || {}).tmove)) {   // a move from the app is still on its way to Trello — don't undo it
      held++;
      if (nm) { const nd = { ...(match!.data || {}), ...nm }; upserts.push({ id: match!.id, coll: "sites", data: nd, deleted: false }); match!.data = nd; }
      continue;
    }
    if (skip.has(lname) && !match) { skipped++; continue; }
    const m = mapFor(lname);
    const tl = listIdx[c.idList] ?? null; const tp = typeof c.pos === "number" ? c.pos : (+c.pos || null);
    if (match) {
      const d = match.data || {};
      if (nm || d.tgone || d.tmoveErr || (d.stage || "") !== m.stage || (d.trelloList || "") !== lname || (m.phase && d.phase !== m.phase) || d.tlpos !== tl || d.tpos !== tp || !d.id) {
        const nd: any = { ...d, ...(nm || {}), stage: m.stage, trelloList: lname, tlpos: tl, tpos: tp };
        if (!nd.id) nd.id = match.id;   // M1a
        if (m.phase) nd.phase = m.phase;
        if (d.tgone) { delete nd.tgone; delete nd.tgoneAt; delete nd.stageBeforeGone; }   // A1: the card is back on the board
        if (d.tmoveErr) delete nd.tmoveErr;   // M7: the job shows where the card really is now — the old warning is gone
        match.data = nd;
        upserts.push({ id: match.id, coll: "sites", data: nd, deleted: false });
        updated++;
      } else unchanged++;
    } else {
      const t = splitName(c.name);
      const nid = "tc_" + sl;
      const nd: any = { id: nid, name: t.name || c.name, tname: t.name || c.name, trello: c.shortUrl || ("https://trello.com/c/" + sl),
        trelloList: lname, stage: m.stage, from: "trello", tlpos: tl, tpos: tp };   // M1a: the id goes inside too
      if (t.phone) nd.phone = t.phone;
      if (m.phase) nd.phase = m.phase;
      upserts.push({ id: nid, coll: "sites", data: nd, deleted: false });
      created++; newOnes.push(nd.name);
    }
  }

  // A1) cards archived or deleted in Trello: hide their jobs (kept, never erased)
  const goneList = existing.filter((r) => { const d = r.data || {}; const sl = shortLinkFromUrl(d.trello);
    return sl && !openSL.has(sl) && !d.tgone && !d.tmove && d.stage !== "lost"; });
  const linked = existing.filter((r) => shortLinkFromUrl(r.data?.trello)).length;
  const goneSafe = openSL.size >= linked * 0.5 && goneList.length <= 15;
  let gone = 0; const goneLog: string[] = goneList.map((r) => String(r.data?.name || r.id));
  if (goneSafe) for (const r of goneList) {
    const d = r.data || {}; const nd = { ...d, stageBeforeGone: d.stage || "active", stage: "lost", tgone: true, tgoneAt: Date.now() };
    upserts.push({ id: r.id, coll: "sites", data: nd, deleted: false }); gone++;
  }

  // 3) the board's lists, for the app's "Move job to" (Lost Bids left out)
  const pub = lists.filter((l: any) => mapFor(l.name).stage !== "lost").map((l: any, i: number) => ({ id: l.id, name: l.name, stage: mapFor(l.name).stage, phase: mapFor(l.name).phase || null, pos: listIdx[l.id] ?? i }));
  // M7: the app shows when the board was last read ("Trello synced 10:35") — written at most every 15 minutes unless the lists changed
  const { data: curL } = await sb.from("records").select("data").eq("coll", "_").eq("id", "trelloLists").maybeSingle();
  const lastSync = +(curL?.data?.v?.syncedAt || 0);
  if (JSON.stringify(curL?.data?.v?.lists || null) !== JSON.stringify(pub) || Date.now() - lastSync > 15 * 60000 || moveErr)
    upserts.push({ id: "trelloLists", coll: "_", data: { v: { board: BOARD, lists: pub, syncedAt: Date.now(), moveErrors: moveErr } }, deleted: false });

  const summary = { board: BOARD, lists: lists.length, cards: cards.length, created, updated, unchanged, skippedAdmin: skipped, skippedMerged, skippedRemoved,
    linkedByName, linked: linkLog.slice(0, 20),
    hiddenGone: gone, goneHeld: goneSafe ? 0 : goneList.length, gone: goneLog.slice(0, 20), movedToTrello: moved, moveErrors: moveErr, heldForMove: held, moves: moveLog.slice(0, 20), renamed, renames: renameLog.slice(0, 20),
    write: WRITE, sampleNew: newOnes.slice(0, 20) };
  if (dry) return json({ dryRun: true, ...summary });

  const last: Record<string, any> = {};
  for (const u of upserts) last[u.coll + "|" + u.id] = u;             // one write per record
  const rows = Object.values(last);
  // W1: jobs → only the changed fields, merged on the server (trello_apply_sites); a removed job is never brought back,
  // and a job moved in the app since this run read it keeps the app's move. The '_' list record is written as before.
  const siteRows: any[] = []; const other: any[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const u of rows as any[]) {
    if (u.coll !== "sites") { other.push(u); continue; }
    const was = orig[u.id];
    if (!was) { siteRows.push({ id: u.id, create: true, patch: u.data }); continue; }
    const patch: Record<string, unknown> = {}; const unset: string[] = [];
    for (const k of Object.keys(u.data || {})) if (!same(u.data[k], was[k])) patch[k] = u.data[k];
    for (const k of Object.keys(was)) if (!(k in (u.data || {}))) unset.push(k);
    if (Object.keys(patch).length || unset.length) siteRows.push({ id: u.id, patch, unset, expectMove: was.tmove ?? null });
  }
  const applied = { updated: 0, created: 0, skipped: 0, heldForAppMove: 0 };
  for (let i = 0; i < siteRows.length; i += 100) {
    const { data: res, error } = await sb.rpc("trello_apply_sites", { p_rows: siteRows.slice(i, i + 100) });
    if (error) throw error;
    for (const k of Object.keys(applied)) (applied as any)[k] += +((res as any)?.[k] || 0);
  }
  for (let i = 0; i < other.length; i += 200) {
    const { error } = await sb.from("records").upsert(other.slice(i, i + 200), { onConflict: "coll,id" });
    if (error) throw error;
  }
  return json({ applied: true, written: applied, ...summary });
});
