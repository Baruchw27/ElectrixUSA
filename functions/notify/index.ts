// Supabase Edge Function "notify": sends a phone notification when a new bell message is filed for someone.
// Called by the database trigger (schema.sql, "phone notifications") with {to, msg, id, link, ts}. Keys live in the
// private server_config table: secret, vapid_public, vapid_private (env secrets VAPID_PUBLIC / VAPID_PRIVATE / PUSH_SECRET also work).
// B1: only the recipient's phones are read; nobody turned off (inactive / removed) is notified; a phone that was handed
// to someone else only gets the NEWEST person's alerts; a message that arrives more than 30 minutes late (saved
// offline) stays in the bell but does not buzz the phone; tapping the notification opens that message (id).
// P2 (Baruch 2026-10-27): the message also carries `job` (an alert about a task → the phone shows "Mark done" / "Reply"
// buttons where the phone supports them), `lang` (button words in Spanish for Spanish speakers) and `badge`
// (how many unread alerts the person has → the number on the app icon).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const LATE_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfgRows } = await sb.from("server_config").select("k,v").in("k", ["secret", "vapid_public", "vapid_private"]);
  const cfg: Record<string, string> = {};
  for (const r of cfgRows ?? []) cfg[r.k] = r.v;
  const secret = Deno.env.get("PUSH_SECRET") || cfg.secret;
  if (!secret || req.headers.get("x-push-secret") !== secret) return new Response("no", { status: 401 });
  const { to, msg, id, ts, link } = await req.json();
  if (!to || !msg) return new Response("skip");
  // the person must still be on the team and switched on
  const { data: emp } = await sb.from("records").select("data").eq("coll", "emps").eq("id", to).eq("deleted", false).maybeSingle();
  if (!emp || emp.data?.inactive) return new Response(JSON.stringify({ sent: 0, skipped: "not active" }), { headers: { "Content-Type": "application/json" } });
  if (typeof ts === "number" && Date.now() - ts > LATE_MS) return new Response(JSON.stringify({ sent: 0, skipped: "late" }), { headers: { "Content-Type": "application/json" } });
  webpush.setVapidDetails("mailto:office@electrixusa.com", Deno.env.get("VAPID_PUBLIC") || cfg.vapid_public, Deno.env.get("VAPID_PRIVATE") || cfg.vapid_private);
  // P2: unread count for the app icon, and whether this alert is about a task
  let badge: number | undefined;
  try {
    const { count } = await sb.from("records").select("id", { count: "exact", head: true }).eq("coll", "inbox").eq("deleted", false).eq("data->>to", to).eq("data->>read", "false");
    if (typeof count === "number") badge = count;
  } catch (_) { /* no badge */ }
  let lk: any = link; if (typeof lk === "string") { try { lk = JSON.parse(lk); } catch (_) { lk = null; } }
  if (!lk && id) { try { const { data: ib } = await sb.from("records").select("data").eq("coll", "inbox").eq("id", id).maybeSingle(); lk = ib?.data?.link ?? null; } catch (_) { lk = null; } }
  const job = lk && typeof lk === "object" && lk.job ? String(lk.job) : undefined;
  const payload: Record<string, unknown> = { title: "Electrix", body: String(msg).slice(0, 180), id: id || "", lang: emp.data?.lang === "es" ? "es" : "en" };
  if (job) payload.job = job;
  if (badge !== undefined) payload.badge = badge;
  const { data: mine } = await sb.from("records").select("id,data,updated_at").eq("coll", "push").eq("deleted", false).eq("data->>who", to);
  let sent = 0; const errs: string[] = [];
  for (const r of mine ?? []) {
    const sub = r.data?.sub; const ep = sub?.endpoint;
    if (!sub || !ep) continue;
    // the same phone signed up later by someone else: that phone now belongs to them — stop sending this person's alerts there
    const { data: newer } = await sb.from("records").select("id,data,updated_at").eq("coll", "push").eq("deleted", false)
      .eq("data->sub->>endpoint", ep).neq("data->>who", to).gt("updated_at", r.updated_at).limit(1);
    if (newer && newer.length) { await sb.from("records").update({ deleted: true, data: {} }).eq("coll", "push").eq("id", r.id); continue; }
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      errs.push(String(code ?? (e as Error).message));
      if (code === 404 || code === 410) await sb.from("records").update({ deleted: true, data: {} }).eq("coll", "push").eq("id", r.id);
    }
  }
  return new Response(JSON.stringify({ sent, errs, badge: badge ?? null, job: job ?? null }), { headers: { "Content-Type": "application/json" } });
});
