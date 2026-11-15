// Supabase Edge Function "ask" — the ✨ Ask assistant inside the Electrix app (Baruch 11/15).
// The phone sends the conversation; this function adds the instructions and the list of tools and asks Claude.
// The TOOLS RUN ON THE PHONE, on the data that person's phone already has — so the assistant can never see or do more
// than that person can in the app (rates and job costs stay hidden from whoever can't see them now — job_cost works only for the owner and Payroll).
// Key: ANTHROPIC_API_KEY secret, or the private server_config row "anthropic_key" — pasted in the app by the owner or Payroll
// (Hours → AI key; ai_set_key). The same key the "ai" function uses.
// Who: owner, managers and office staff. Limit: ai_take('ask') — per person and per team per day.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const TOOLS = [
  { name: "find_jobs", description: "Search the jobs (job sites) in the app by address, street, house number or name. Spelling can be off (spoken names, e.g. 'haddash' for 'Hadas'). Returns the best matches with id, name, stage and crew. Use before anything that needs a job id.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "open_job", description: "Open a job's page on the person's screen (files, notes, tasks, hours). Use when they say pull up / open / show me a job.",
    input_schema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
  { name: "job_summary", description: "Everything about one job: address, stage, crew, managers, open tasks, latest notes, O&R (utility) status, files count, hours in the last 14 days by person.",
    input_schema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
  { name: "find_people", description: "Search the team (employees and office) by name or nickname. Returns id, name, role, title, crew. Crews can be found too (e.g. 'crew 2').",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "create_task", description: "Send a task / job to one or more people or crews, exactly as the app's 'New task' button does (they get a notification). Use only when the person asks for a task to be made. to = ids from find_people (or crew ids). job_id optional (from find_jobs). due: one of '', 'Today', 'Tomorrow morning', 'This week', 'ASAP'.",
    input_schema: { type: "object", properties: { to: { type: "array", items: { type: "string" } }, text: { type: "string", description: "What to do, short and clear, in the words the person used" }, job_id: { type: "string" }, due: { type: "string" }, priority: { type: "boolean" } }, required: ["to", "text"] } },
  { name: "open_tasks", description: "Open (not done) tasks, optionally for one person or crew and/or one job. Returns who, what, job, due, from, age.",
    input_schema: { type: "object", properties: { person_id: { type: "string" }, job_id: { type: "string" } } } },
  { name: "hours", description: "Work hours from the time clock between two dates (inclusive, YYYY-MM-DD), optionally for one person and/or one job. Returns totals per person, per job and per day. No pay or rates.",
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, person_id: { type: "string" }, job_id: { type: "string" } }, required: ["from", "to"] } },
  { name: "working_now", description: "Who is clocked in right now and where, since when; also who is scheduled today but not clocked in.",
    input_schema: { type: "object", properties: {} } },
  { name: "schedule", description: "Which crew is scheduled at which job on a date (YYYY-MM-DD).",
    input_schema: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
  { name: "orr_status", description: "O&R (Orange & Rockland utility) requests: step and latest note, for one job or all open ones.",
    input_schema: { type: "object", properties: { job_id: { type: "string" } } } },
  { name: "job_cost", description: "What a job cost — the same numbers as Reports → Job cost: labor (hours × what each man was actually paid that week per his Fingercheck paycheck, overtime included; his hourly rate when there's no paycheck yet), material receipts entered on the job, and travel. All time, or between two dates (YYYY-MM-DD). Owner and Payroll only.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["job_id"] } },
  { name: "open_screen", description: "Open a screen of the app: home, jobs (tasks), sites (jobs list), punch (time clock), hours, sched (schedule), cal (calendar), mat (material), team, orr, rep (reports), more.",
    input_schema: { type: "object", properties: { screen: { type: "string" } }, required: ["screen"] } },
];

function system(me: any, today: string, lang: string) {
  return [
    "You are the assistant inside the Electrix USA field app. Electrix USA is an electrical contractor in Rockland County, NY (owner Baruch).",
    "Crews 1, 2 and 5 do rough work, crews 3 and 4 do finishing; site managers are Yossi and Shauly; office: Shia (estimates, payroll, O&R), Menachem (material and billing; also called Nachum), Matty, Miriam (payroll).",
    `You are talking to ${me.name || "a team member"} (role: ${me.role}${me.title ? ", " + me.title : ""}). Now: ${today} (New York time).`,
    `Answer in ${lang === "es" ? "Spanish" : "English"} unless they write in the other language. Be short — this is a phone. Plain words, no markdown tables; short lines or bullets are fine.`,
    "Always use the tools for facts about jobs, people, tasks, hours, schedule or O&R — never guess or invent. The tools only show what this person may see.",
    "Names and addresses are often spoken: match loosely ('haddash' may be 'Hadas', 'Nachum' is Menachem). If more than one job or person fits and it matters, ask which one (list the choices) instead of guessing; if one clearly fits, go ahead.",
    "Actions: open_job / open_screen just open the screen — do them right away when asked. create_task sends a real task with a notification: do it when the person clearly asks for a task; say exactly who it went to and what. Do nothing they did not ask for.",
    "Money: when asked what a job cost, use job_cost and give the total plus the parts (labor, material, travel) — it is the same as Reports → Job cost. Mention if some weeks are estimates (no paycheck yet), anyone with no pay info, and that payroll taxes and insurance are not included. job_cost works only for the owner and Payroll; for anyone else say costs are only for the owner and Payroll. Never give money numbers from anywhere else, and don't volunteer a person's hourly rate unless asked by the owner or Payroll.",
    "You cannot delete, change hours or punches, send emails or messages outside the app — say so and point to the screen where they can do it.",
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: me } = await sb.rpc("my_emp_data");
  if (!me || !me.id || me.inactive) return json({ error: "not allowed" }, 401);
  if (!["owner", "manager", "office"].includes(me.role) && !me.all) return json({ error: "not allowed" }, 403);
  let body: any = {}; try { body = await req.json(); } catch (_) { return json({ error: "bad request" }, 400); }
  let key = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  if (!key) { const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!); const { data } = await adm.from("server_config").select("v").eq("k", "anthropic_key").maybeSingle(); key = data?.v ?? ""; }
  if (!key) return json({ error: "off" }, 503);
  // "Test the key" button: asks Anthropic whether the key works (free — no question is asked, nothing is counted)
  if (body.ping) { const t = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
    return json({ ok: t.ok, status: t.status }); }
  let messages: any[] = Array.isArray(body.messages) ? body.messages : [];
  // a long talk keeps the last ~40 turns, always starting at one of the person's own questions (never mid tool-call)
  if (messages.length > 40) { let i = messages.length - 40; while (i < messages.length && !(messages[i]?.role === "user" && typeof messages[i]?.content === "string")) i++; messages = messages.slice(i); }
  if (!messages.length) return json({ error: "bad request" }, 400);
  const { data: ok } = await sb.rpc("ai_take", { p_kind: "ask" });
  if (!ok) return json({ error: "limit" }, 429);
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date());
  const tools = TOOLS.map((t, i) => i === TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 1500, system: system(me, today, body.lang === "es" ? "es" : "en"), tools, messages }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: j?.error?.message ?? "ai error" }, 502);
  return json({ content: j.content ?? [], stop_reason: j.stop_reason });
});
