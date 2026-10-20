// STAGING copy of the "ai" function, hardened for label reading. Works only once the staging secret ANTHROPIC_API_KEY is set.
// Security: the Anthropic key lives only in the server secret ANTHROPIC_API_KEY (never in the app or the repo);
// only signed-in team members can call it; photos are passed straight through and never stored or logged;
// every call is counted (public.ai_take): 60 per person per day, 400 per team per day, 3,000 per month;
// label photos larger than ~1.5 MB are refused. Label reading ("label") uses Claude Sonnet 5.5 — in the staging comparison it
// read 40/40 hard labels (Haiku 5.5: 39/40, Opus 5.5: 40/40 at twice Sonnet's price) — with a short answer.
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
  const kind = tier === "label" ? "label" : tier === "quick" ? "quick" : "full";
  // scanner label reading: at most 2 photos of ~1.5 MB each (the app's other AI features keep their old limits)
  const imgs = Array.isArray(images) ? (kind === "label" ? images.slice(0, 2) : images) : [];
  if (kind === "label") for (const im of imgs) if (typeof im?.data !== "string" || im.data.length > 2_000_000 || !/^image\/(jpeg|png|webp)$/.test(im.type)) return json({ error: "photo too large or not a photo" }, 413);
  const { data: allowed, error: capErr } = await sb.rpc("ai_take", { p_kind: kind });
  if (capErr || allowed !== true) return json({ error: "daily AI limit reached — try again tomorrow" }, 429);
  const content: unknown[] = imgs.map((im: any) => ({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } }));
  const last = messages[messages.length - 1]; content.push({ type: "text", text: kind === "label" ? String(last.content ?? "").slice(0, 4000) : last.content });
  const model = kind === "quick" ? "claude-haiku-5-5" : "claude-sonnet-5-5";
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: kind === "label" ? 400 : 8000, system: system ?? undefined, messages: [...messages.slice(0, -1), { role: "user", content }] }),
  });
  const j = await r.json();
  if (!r.ok) return json({ error: j?.error?.message ?? "ai error" }, 502);
  const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text, truncated: j.stop_reason === "max_tokens", model, ms: Date.now() - t0, usage: { in: j.usage?.input_tokens ?? null, out: j.usage?.output_tokens ?? null } });
});
