// STAGING copy of the "ai" function, hardened for label reading (NOT switched on: no key is set on staging).
// Security: the Anthropic key lives only in the server secret ANTHROPIC_API_KEY (never in the app or the repo);
// only signed-in team members can call it; photos are passed straight through and never stored or logged;
// every call is counted per person per day (public.ai_take) — 60 per person and 400 for the whole team per day;
// photos larger than ~1.5 MB are refused; label reading always uses the small, cheap model with a short answer.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: ok } = await sb.rpc("is_member");
  if (!ok) return json({ error: "not allowed" }, 401);
  const key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) return json({ error: "AI is not switched on yet" }, 503);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const { messages, images, system, tier } = body ?? {};
  if (!Array.isArray(messages) || !messages.length) return json({ error: "bad request" }, 400);
  const imgs = Array.isArray(images) ? images.slice(0, 2) : [];
  for (const im of imgs) if (typeof im?.data !== "string" || im.data.length > 2_000_000 || !/^image\/(jpeg|png|webp)$/.test(im.type)) return json({ error: "photo too large or not a photo" }, 413);
  const { data: allowed, error: capErr } = await sb.rpc("ai_take", { p_kind: tier === "quick" ? "quick" : "full" });
  if (capErr || allowed !== true) return json({ error: "daily AI limit reached — try again tomorrow" }, 429);
  const content: unknown[] = imgs.map((im: any) => ({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } }));
  const last = messages[messages.length - 1]; content.push({ type: "text", text: String(last.content ?? "").slice(0, 4000) });
  const quick = tier === "quick";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: quick ? "claude-haiku-5-5" : "claude-sonnet-5-5", max_tokens: quick ? 400 : 8000, system: system ?? undefined, messages: [...messages.slice(0, -1), { role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) return json({ error: j?.error?.message ?? "ai error" }, 502);
  const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text, truncated: j.stop_reason === "max_tokens" });
});
