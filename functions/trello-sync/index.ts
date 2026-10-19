// Trello -> Electrix job sync (scheduled pull).
// Reads the "Genreal Overview" board and upserts each card as a `sites` (job) record.
// - Matches existing jobs by the card shortLink already stored in site.data.trello (no duplicates).
// - New card -> new job; moved card -> stage/list updated.
// - Skips admin-only lists (default: "Lead").
// - NEVER touches app-owned fields (lat/lng/fence, crew, manager, notes, hours, price): only
//   name(for new), stage, trelloList, trello, phase, and the trello bookkeeping fields.
// - Read-only against Trello. Credentials + secret come from the server_config table.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// internal keys: upcoming=Upcoming, ready=Confirmed jobs, active=Roughing, inspection=Finishing, done=Complete
const DEFAULT_MAP: Record<string, { stage: string; phase?: string }> = {
  "Lead": { stage: "upcoming" }, "Upcoming": { stage: "upcoming" },
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
  "Roughing Done": { stage: "active", phase: "rough" },
  "Inspection Passed": { stage: "active", phase: "rough" },
  "Ready To Make Finishing": { stage: "inspection", phase: "finish" },
  "Finishing In Progress": { stage: "inspection", phase: "finish" },
  "Add Ons": { stage: "inspection", phase: "finish" },
  "Done Finishing": { stage: "done", phase: "finish" },
  "Invoiced": { stage: "done" }, "Invoice Updated": { stage: "done" },
  "Job is Completed": { stage: "done" },
};

const shortLinkFromUrl = (u: unknown): string | null => {
  const m = String(u ?? "").match(/\/c\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  // config from server_config
  const { data: cfgRows } = await sb.from("server_config").select("k,v");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows || []) cfg[r.k] = r.v;
  const KEY = cfg["trello_key"], TOKEN = cfg["trello_token"], BOARD = cfg["trello_board"];
  const SECRET = cfg["secret"] || "";
  const skip = new Set((cfg["trello_skip_lists"] || "Lead").split(",").map(s => s.trim()).filter(Boolean));
  let MAP = DEFAULT_MAP;
  try { if (cfg["trello_map"]) MAP = JSON.parse(cfg["trello_map"]); } catch (_) {}

  if (SECRET) {
    const got = req.headers.get("x-push-secret") || url.searchParams.get("secret") || "";
    if (got !== SECRET) return new Response("forbidden", { status: 403 });
  }
  if (!KEY || !TOKEN || !BOARD) return new Response("trello config missing", { status: 500 });

  const trello = async (path: string) => {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`https://api.trello.com/1/${path}${sep}key=${KEY}&token=${TOKEN}`);
    if (!r.ok) throw new Error(`trello ${path} -> ${r.status} ${await r.text()}`);
    return r.json();
  };
  const mapFor = (l: string) => MAP[l] || { stage: "upcoming" };

  const lists = await trello(`boards/${BOARD}/lists?fields=name`);
  const listName: Record<string, string> = {};
  for (const l of lists) listName[l.id] = l.name;
  const cards = await trello(`boards/${BOARD}/cards?fields=name,idList,shortLink,shortUrl,closed`);

  const { data: existing, error: exErr } = await sb
    .from("records").select("id,data").eq("coll", "sites").eq("deleted", false);
  if (exErr) throw exErr;
  const bySL: Record<string, { id: string; data: any }> = {};
  for (const r of existing || []) { const sl = shortLinkFromUrl(r.data?.trello); if (sl) bySL[sl] = r; }

  let created = 0, updated = 0, unchanged = 0, skipped = 0;
  const newOnes: string[] = [];
  const upserts: any[] = [];

  for (const c of cards) {
    if (c.closed) continue;
    const sl = c.shortLink; if (!sl) continue;
    const lname = listName[c.idList] || "";
    if (skip.has(lname) && !bySL[sl]) { skipped++; continue; }
    const m = mapFor(lname);
    const match = bySL[sl];
    if (match) {
      const d = match.data || {};
      if ((d.stage || "") !== m.stage || (d.trelloList || "") !== lname || (m.phase && d.phase !== m.phase)) {
        const nd = { ...d, stage: m.stage, trelloList: lname };
        if (m.phase) nd.phase = m.phase;
        upserts.push({ id: match.id, coll: "sites", data: nd, deleted: false });
        updated++;
      } else unchanged++;
    } else {
      const nd: any = { name: c.name, trello: c.shortUrl || ("https://trello.com/c/" + sl),
        trelloList: lname, stage: m.stage, from: "trello" };
      if (m.phase) nd.phase = m.phase;
      upserts.push({ id: "tc_" + sl, coll: "sites", data: nd, deleted: false });
      created++; newOnes.push(c.name);
    }
  }

  const summary = { board: BOARD, lists: lists.length, cards: cards.length,
    created, updated, unchanged, skippedAdmin: skipped, sampleNew: newOnes.slice(0, 20) };
  if (dry) return Response.json({ dryRun: true, ...summary });

  for (let i = 0; i < upserts.length; i += 200) {
    const { error } = await sb.from("records").upsert(upserts.slice(i, i + 200), { onConflict: "coll,id" });
    if (error) throw error;
  }
  return Response.json({ applied: true, ...summary });
});
