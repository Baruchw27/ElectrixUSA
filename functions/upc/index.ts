// Supabase Edge Function "upc": barcode → product name (Home Depot, Lowe's, supply houses…), free sources, no key.
// 1) our own saved answers  2) UPCitemdb (free, ~100 new lookups a day)  3) Open Products / Open Food Facts.
// Every answer is saved, so the same barcode is never looked up twice. Only signed-in team members can use it.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const UA = { "User-Agent": "ElectrixUSA-FieldApp/1.0 (office@electrixusa.com)", "Accept": "application/json" };
type P = { title: string; brand?: string; model?: string; image?: string; category?: string; src: string };
async function tm(url: string, ms = 6000) { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); try { return await fetch(url, { headers: UA, signal: c.signal }); } finally { clearTimeout(t); } }
async function upcitemdb(code: string): Promise<P | null | "limit"> {
  try {
    const r = await tm("https://api.upcitemdb.com/prod/trial/lookup?upc=" + code);
    if (r.status === 429) return "limit";
    const j = await r.json(); const it = j?.items?.[0];
    if (!it?.title) return null;
    const img = (it.images || []).find((u: string) => /^https:/.test(u)) || (it.images || [])[0];
    return { title: it.title, brand: it.brand || undefined, model: it.model || undefined, image: img, category: it.category || undefined, src: "upcitemdb" };
  } catch (_) { return null; }
}
async function openFacts(code: string): Promise<P | null> {
  for (const host of ["world.openproductsfacts.org", "world.openfoodfacts.org"]) {
    try {
      const r = await tm(`https://${host}/api/v2/product/${code}.json?fields=product_name,brands,image_front_url,image_url,categories`);
      const j = await r.json(); const p = j?.product;
      if (j?.status === 1 && p?.product_name) return { title: p.product_name, brand: p.brands || undefined, image: p.image_front_url || p.image_url, category: p.categories, src: host.split(".")[1] };
    } catch (_) { /* next */ }
  }
  return null;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const sec = req.headers.get("x-push-secret");
  let ok = false;
  if (sec) { const { data } = await adm.from("server_config").select("v").eq("k", "secret").maybeSingle(); ok = !!data?.v && data.v === sec; } // the server's own checks
  else { const { data } = await sb.rpc("is_member"); ok = !!data; }
  if (!ok) return json({ error: "not allowed" }, 401);
  const { code: raw } = await req.json().catch(() => ({}));
  let code = String(raw || "").replace(/\D/g, "");
  if (code.length < 8 || code.length > 14) return json({ found: false });
  const keys = [code]; if (code.length === 13 && code[0] === "0") keys.push(code.slice(1)); if (code.length === 12) keys.push("0" + code);
  const { data: hit } = await adm.from("upc_cache").select("code,data,ts").in("code", keys).limit(1).maybeSingle();
  if (hit && (hit.data?.title || Date.now() - new Date(hit.ts).getTime() < 7 * 864e5)) return json(hit.data?.title ? { found: true, ...hit.data, cached: true } : { found: false });
  let p: P | null = null; let limited = false;
  for (const k of keys) { const r = await upcitemdb(k); if (r === "limit") { limited = true; break; } if (r) { p = r; break; } }
  if (!p) p = await openFacts(keys[keys.length - 1].padStart(13, "0"));
  if (!p && limited) return json({ found: false, limit: true });
  await adm.from("upc_cache").upsert({ code: keys[0], data: p ?? {}, ts: new Date().toISOString() });
  return json(p ? { found: true, ...p } : { found: false });
});
