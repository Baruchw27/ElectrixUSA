// STAGING ONLY — a fake Trello (just the calls trello-personal / trello-connect use), so tests never touch a real board.
// State lives in staging server_config 'mock_trello'. Only token 'MOCKTOKEN…' is accepted (anything else → 401).
// Test helper: POST /stg-trello-mock/__reset {state} and GET /stg-trello-mock/__state (need x-push-secret).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
type Card = { id: string; name: string; desc: string; idList: string; idBoard: string; due: string | null; dueComplete: boolean; closed: boolean; shortUrl: string; dateLastActivity: string };
type State = { member: { id: string; username: string; fullName: string }; boards: { id: string; name: string; url: string; closed: boolean }[]; lists: { id: string; name: string; idBoard: string; closed: boolean }[]; cards: Card[]; log: string[] };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const u = new URL(req.url); const path = u.pathname.replace(/^.*\/stg-trello-mock\/?/, "").replace(/^1\//, "");
  const { data: rows } = await adm.from("server_config").select("k,v").in("k", ["mock_trello", "secret", "trello_key"]);
  const c: Record<string, string> = {}; for (const r of rows || []) c[r.k] = r.v;
  const save = async (s: State) => { await adm.from("server_config").upsert({ k: "mock_trello", v: JSON.stringify(s) }, { onConflict: "k" }); };
  if (path.startsWith("__")) {
    if (req.headers.get("x-push-secret") !== c.secret) return j({ error: "no" }, 403);
    if (path === "__reset") { const b = await req.json(); await save({ log: [], ...b }); return j({ ok: true }); }
    return j(JSON.parse(c.mock_trello || "{}"));
  }
  const p = u.searchParams; if (p.get("key") !== c.trello_key) return j({ error: "invalid key" }, 401);
  if (!String(p.get("token") || "").startsWith("MOCKTOKEN")) return new Response("invalid token", { status: 401 });
  const s: State = JSON.parse(c.mock_trello || "{}"); s.log = s.log || [];
  const now = new Date().toISOString(); let m: RegExpMatchArray | null;
  s.log.push(req.method + " " + path); if (s.log.length > 200) s.log = s.log.slice(-200);
  let res: unknown;
  if (req.method === "GET" && path === "members/me") res = s.member;
  else if (req.method === "GET" && path === "members/me/boards") res = s.boards.filter((b) => !b.closed);
  else if (req.method === "GET" && (m = path.match(/^boards\/([^/]+)\/lists$/))) res = s.lists.filter((l) => l.idBoard === m![1] && !l.closed);
  else if (req.method === "GET" && (m = path.match(/^boards\/([^/]+)\/cards$/))) res = s.cards.filter((x) => x.idBoard === m![1] && !x.closed);
  else if (req.method === "PUT" && (m = path.match(/^cards\/([^/]+)$/))) {
    const card = s.cards.find((x) => x.id === m![1]); if (!card) return j({ error: "card not found" }, 404);
    if (p.has("name")) card.name = p.get("name")!; if (p.has("desc")) card.desc = p.get("desc")!;
    if (p.has("dueComplete")) card.dueComplete = p.get("dueComplete") === "true";
    if (p.has("due")) card.due = p.get("due") === "null" ? null : p.get("due");
    card.dateLastActivity = now; res = card;
  } else if (req.method === "POST" && path === "cards") {
    const list = s.lists.find((l) => l.id === p.get("idList")); if (!list) return j({ error: "invalid idList" }, 400);
    const id = "c" + crypto.randomUUID().replace(/-/g, "").slice(0, 23);
    const card: Card = { id, name: p.get("name") || "", desc: p.get("desc") || "", idList: list.id, idBoard: list.idBoard, due: p.get("due") && p.get("due") !== "null" ? p.get("due") : null,
      dueComplete: p.get("dueComplete") === "true", closed: false, shortUrl: "https://trello.com/c/" + id.slice(0, 8), dateLastActivity: now };
    s.cards.push(card); res = card;
  } else return j({ error: "not in the mock: " + req.method + " " + path }, 404);
  await save(s); return j(res);
});
