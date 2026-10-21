// Supabase Edge Function "trello-connect": the one-time "connect my Trello" step for one person (e.g. Menachem).
// The office makes a one-time code for that person (server_config 'trello_connect:<sha256 of code>' = {emp, exp, used}).
// The page connect-trello.html?c=<code> (on the app site) calls:
//   POST {action:'info', c}           → is the code valid, for whom, and the Trello "Allow" link (app name Electrix USA)
//   POST {action:'connect', c, token} → checks the code AND that Trello accepts the token (who it belongs to), then stores
//                                       the token on the server only (server_config 'trello_user_token:<emp>'), marks the
//                                       code used, and starts the first sync. The token is never shown or sent anywhere else.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" } });
async function sha(s: string) { const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); return [...d].map((b) => b.toString(16).padStart(2, "0")).join(""); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "use the connect page" }, 405);
  let a: Record<string, string> = {}; try { a = await req.json(); } catch (_) { /* empty */ }
  const code = String(a.c || "");
  if (!/^[A-Za-z0-9]{20,64}$/.test(code)) return json({ ok: false, error: "This link is not valid." }, 400);
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const ck = "trello_connect:" + await sha(code);
  const { data: rows } = await adm.from("server_config").select("k,v").in("k", [ck, "trello_key", "trello_api_base", "secret", "functions_url"]);
  const cfg: Record<string, string> = {}; for (const r of rows || []) cfg[r.k] = r.v;
  let inv: { emp: string; exp: number; used?: boolean } | null = null; try { inv = cfg[ck] ? JSON.parse(cfg[ck]) : null; } catch (_) { inv = null; }
  if (!inv || !inv.emp) return json({ ok: false, error: "This link is not valid." }, 404);
  if (inv.used) return json({ ok: false, error: "This link was already used. Ask the office for a new one if you need to connect again." }, 410);
  if (Date.now() > inv.exp) return json({ ok: false, error: "This link has expired. Ask the office for a new one." }, 410);
  const { data: emp } = await adm.from("records").select("data").eq("coll", "emps").eq("id", inv.emp).eq("deleted", false).maybeSingle();
  if (!emp) return json({ ok: false, error: "This link is not valid." }, 404);
  const first = String(emp.data?.name || "").split(" ")[0];
  const KEY = cfg.trello_key; const BASE = (cfg.trello_api_base || "https://api.trello.com/1").replace(/\/$/, "");
  if ((a.action || "info") === "info") {
    const allow = "https://trello.com/1/authorize?" + new URLSearchParams({ expiration: "never", name: "Electrix USA", scope: "read,write", response_type: "token", key: KEY }).toString();
    return json({ ok: true, name: first, allow });
  }
  const token = String(a.token || "").trim();
  if (!/^[A-Za-z0-9]{32,128}$/.test(token)) return json({ ok: false, error: "That doesn't look like the Trello code. Copy the whole code Trello shows after you press Allow." }, 400);
  const r = await fetch(`${BASE}/members/me?` + new URLSearchParams({ fields: "fullName,username", key: KEY, token }));
  if (!r.ok) return json({ ok: false, error: "Trello did not accept that code. Press the Trello button again, press Allow, and copy the new code." }, 400);
  const m = await r.json();
  const nowIso = new Date().toISOString();
  const up = await adm.from("server_config").upsert([
    { k: "trello_user_token:" + inv.emp, v: token },
    { k: "trello_user:" + inv.emp, v: JSON.stringify({ id: m.id, username: m.username, fullName: m.fullName, at: nowIso }) },
    { k: ck, v: JSON.stringify({ ...inv, used: true, usedAt: nowIso }) },
  ], { onConflict: "k" });
  if (up.error) return json({ ok: false, error: "Could not save — please try again in a minute." }, 500);
  // first sync right away (best effort)
  try { if (cfg.functions_url && cfg.secret) await fetch(cfg.functions_url + "/trello-personal", { method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": cfg.secret }, body: "{}" }); } catch (_) { /* the 5-minute sync will do it */ }
  return json({ ok: true, name: first, trello: m.fullName || m.username });
});
