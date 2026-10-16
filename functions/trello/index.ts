// Supabase Edge Function "trello":
//  - POST from the database when a job's stage changes → moves the card on the "General Overview" board
//  - GET ?file=<attachment url> from the app (signed-in team member) → returns the Trello file so it opens inside the app
// Secrets: TRELLO_KEY, TRELLO_TOKEN, PUSH_SECRET (shared with the database), TRELLO_BOARD (optional, defaults to General Overview)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const KEY = Deno.env.get("TRELLO_KEY")!, TOKEN = Deno.env.get("TRELLO_TOKEN")!;
const BOARD = Deno.env.get("TRELLO_BOARD") ?? "637bdd75100db2001c535fc0";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const LISTS: Record<string, [string, string]> = { // stage → [rough list, finishing list]
  active: ["In Progress", "Finishing In Progress"],
  ready: ["Ready To Start Roughing", "Ready To Make Finishing"],
  inspection: ["Prepper Inspection", "Prepper Inspection"],
  upcoming: ["Upcoming", "Upcoming"],
  priced: ["Submitted Price To Costumer", "Submitted Price To Costumer"],
  done: ["Job is Completed", "Job is Completed"],
};
const api = (p: string, init?: RequestInit) => fetch(`https://api.trello.com/1${p}${p.includes("?") ? "&" : "?"}key=${KEY}&token=${TOKEN}`, init);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("file")) {
    // only signed-in team members
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: ok } = await sb.rpc("is_member");
    if (!ok) return new Response("not allowed", { status: 401, headers: cors });
    const f = url.searchParams.get("file")!;
    if (!/^https:\/\/(api\.)?trello\.com\//.test(f)) return new Response("bad file", { status: 400, headers: cors });
    const r = await fetch(f, { headers: { Authorization: `OAuth oauth_consumer_key="${KEY}", oauth_token="${TOKEN}"` } });
    return new Response(r.body, { status: r.status, headers: { ...cors, "Content-Type": r.headers.get("Content-Type") ?? "application/octet-stream" } });
  }
  if (req.method === "POST") {
    if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_SECRET")) return new Response("no", { status: 401 });
    const { card, stage, phase } = await req.json();
    const short = /trello\.com\/c\/([A-Za-z0-9]+)/.exec(card ?? "")?.[1];
    const names = LISTS[stage]; if (!short || !names) return new Response("skip");
    const want = phase === "finish" ? names[1] : names[0];
    const lists = await (await api(`/boards/${BOARD}/lists?fields=name`)).json();
    const list = lists.find((l: { name: string }) => l.name.trim().toLowerCase() === want.toLowerCase());
    if (!list) return new Response("no list " + want, { status: 404 });
    const r = await api(`/cards/${short}?idList=${list.id}&pos=top`, { method: "PUT" });
    return new Response(r.ok ? "moved" : "failed " + r.status, { status: r.ok ? 200 : 502 });
  }
  return new Response("?", { status: 400, headers: cors });
});
