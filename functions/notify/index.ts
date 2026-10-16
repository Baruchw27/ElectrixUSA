// Supabase Edge Function "notify": sends a phone notification when the app files a new alert for someone.
// Called by the database trigger (schema.sql, "phone notifications"). Keys live in the private server_config table:
// secret, vapid_public, vapid_private (env secrets VAPID_PUBLIC / VAPID_PRIVATE / PUSH_SECRET also work).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfgRows } = await sb.from("server_config").select("k,v");
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.k] = r.v;
  const secret = Deno.env.get("PUSH_SECRET") || cfg.secret;
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response("no", { status: 401 });
  const { to, msg, test } = await req.json();
  if (!to || !msg) return new Response("skip");
  webpush.setVapidDetails("mailto:office@electrixusa.com", Deno.env.get("VAPID_PUBLIC") || cfg.vapid_public, Deno.env.get("VAPID_PRIVATE") || cfg.vapid_private);
  const { data } = await sb.from("records").select("id,data").eq("coll", "push").eq("deleted", false);
  let sent = 0; const errs: string[] = [];
  for (const r of data ?? []) {
    if (r.data?.who !== to || !r.data?.sub) continue;
    try {
      await webpush.sendNotification(r.data.sub, JSON.stringify({ title: "Electrix", body: String(msg).slice(0, 180) }), { TTL: 86400, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      errs.push(String(code ?? (e as Error).message));
      if (code === 404 || code === 410) await sb.from("records").update({ deleted: true, data: {} }).eq("coll", "push").eq("id", r.id);
    }
  }
  return new Response(JSON.stringify({ sent, errs }), { headers: { "Content-Type": "application/json" } });
});
