// Supabase Edge Function "ai": the app's AI features (estimate from plans, read receipts, read stock photos, smart search).
// Key: ANTHROPIC_API_KEY secret, or the private server_config row "anthropic_key". Only signed-in team members can use it.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: ok } = await sb.rpc("is_member");
  if (!ok) return new Response(JSON.stringify({ error: "not allowed" }), { status: 401, headers: cors });
  let key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) { const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); const { data } = await adm.from("server_config").select("v").eq("k", "anthropic_key").maybeSingle(); key = data?.v ?? ""; }
  if (!key) return new Response(JSON.stringify({ error: "AI is not switched on yet" }), { status: 503, headers: cors });
  const { messages, images, system, tier } = await req.json();
  const content: unknown[] = [];
  for (const im of images ?? []) content.push({ type: "image", source: { type: "base64", media_type: im.type, data: im.data } });
  const last = messages[messages.length - 1];
  content.push({ type: "text", text: last.content });
  const body = {
    model: tier === "quick" ? "claude-haiku-5-5" : "claude-sonnet-5-5",
    max_tokens: 8000,
    system: system ?? undefined,
    messages: [...messages.slice(0, -1), { role: "user", content }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) return new Response(JSON.stringify({ error: j?.error?.message ?? "ai error" }), { status: 502, headers: cors });
  const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return new Response(JSON.stringify({ text, truncated: j.stop_reason === "max_tokens" }), { headers: { ...cors, "Content-Type": "application/json" } });
});
