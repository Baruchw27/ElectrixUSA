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
  { name: "create_task", description: "Prepare a task / job for one or more people or crews, like the app's 'New task' button. It shows a card the person checks and taps Send — nothing is sent until they do. Use only when the person asks for a task to be made. to = ids from find_people (or crew ids). job_id optional (from find_jobs). due: one of '', 'Today', 'Tomorrow morning', 'This week', 'ASAP'.",
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
  { name: "find_material", description: "Search the company's material catalog (Leviton devices, wire, boxes, breakers…) by what the person said. Returns stock_id, name, unit and how many are in the garage. Use it for every item before create_material_request.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "create_material_request", description: "Prepare a material request for Menachem, like the Material screen. It shows a card the person checks (they can change amounts) and taps Send — nothing is sent until they do. job_id from find_jobs (or address for a job not in the app). items: [{stock_id from find_material if one clearly fits, name, qty, unit}]. when: 'Now' | 'Tomorrow morning' | 'This week' (default Now). get: 'deliver' (store delivers to the job, default) | 'garage' (take from the garage) | 'pickup' (pick up at the store). note: optional.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, address: { type: "string" }, items: { type: "array", items: { type: "object", properties: { stock_id: { type: "string" }, name: { type: "string" }, qty: { type: "number" }, unit: { type: "string" } }, required: ["name", "qty"] } }, when: { type: "string" }, get: { type: "string" }, note: { type: "string" } }, required: ["items"] } },
  { name: "material_status", description: "Material requests and where they stand (requested / ordered / delivered), for one job, or the person's own (mine: true), or the latest ones.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, mine: { type: "boolean" } } } },
  { name: "add_job_note", description: "Add a note to a job (shows in the job's notes for everyone on the job). Use when they ask to note / write down / remember something for a job. Has Undo.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, text: { type: "string" } }, required: ["job_id", "text"] } },
  { name: "set_job_step", description: "Move a job to another step: upcoming, ready (Confirmed jobs), active (Roughing), roughdone (Rough Complete), inspection (Finishing), done (Complete). Only the owner, site managers, Shia or Menachem. Has Undo.",
    input_schema: { type: "object", properties: { job_id: { type: "string" }, step: { type: "string" } }, required: ["job_id", "step"] } },
  { name: "day_summary", description: "A day at a glance (default today): who clocked in, hours and where, material requests, tasks made / done, tasks open more than a week, open O&R count.",
    input_schema: { type: "object", properties: { date: { type: "string" } } } },
  { name: "set_material_default", description: "Menachem or the owner only: from now on, when someone asks for <phrase> (e.g. 'switch'), use this catalog item without asking. stock_id from find_material.",
    input_schema: { type: "object", properties: { phrase: { type: "string" }, stock_id: { type: "string" } }, required: ["phrase", "stock_id"] } },
  { name: "open_screen", description: "Open a screen of the app: home, jobs (tasks), sites (jobs list), punch (time clock), hours, sched (schedule), cal (calendar), mat (material), team, orr, rep (reports), more.",
    input_schema: { type: "object", properties: { screen: { type: "string" } }, required: ["screen"] } },
];

const LEAD_TOOLS = new Set(["find_jobs", "open_job", "job_summary", "find_material", "create_material_request", "material_status", "add_job_note", "open_screen", "open_tasks"]);
const isLead = (me: any) => !!me?.lead && !["owner", "manager", "office"].includes(me.role) && !me.all;
function system(me: any, today: string, lang: string) {
  return [
    "You are the assistant inside the Electrix USA field app. Electrix USA is an electrical contractor in Rockland County, NY (owner Baruch).",
    "Crews 1, 2 and 5 do rough work, crews 3 and 4 do finishing; site managers are Yossi and Shauly; office: Shia (estimates, payroll, O&R), Menachem (material and billing; also called Nachum), Matty, Miriam (payroll).",
    `You are talking to ${me.name || "a team member"} (role: ${me.role}${me.title ? ", " + me.title : ""}). Now: ${today} (New York time).`,
    `Answer in ${lang === "es" ? "Spanish" : "English"} unless they write in the other language.`,
    "How to write: like a sharp, friendly assistant. Lead with the answer in the first line, bold the key number or name, then only the details that matter. Short paragraphs; a bullet list for 3+ items; no tables, no headings, no filler, no repeating the question. Offer one useful next step only when it helps (e.g. 'Want me to open the job?').",
    "Most questions are SPOKEN and come through the phone's speech-to-text, so words are often misheard: numbers ('600' may be '6 Hadassah' heard as '600 assets'), street names, people's names. Work out what they meant. If find_jobs or find_people finds nothing good, try again with other spellings, just the house number, just the street, or how it sounds — before asking. Never say you can't find something after one try.",
    "Always use the tools for facts about jobs, people, tasks, hours, schedule or O&R — never guess or invent. The tools only show what this person may see.",
    "Names and addresses are often spoken: match loosely ('haddash' may be 'Hadas', 'Nachum' is Menachem). If more than one job or person fits and it matters, ask which one (list the choices) instead of guessing; if one clearly fits, go ahead.",
    "Actions: open_job / open_screen just open the screen — do them right away when asked. create_task and create_material_request do NOT send: they put a card on the screen; the person checks it and taps Send (or says 'send it'). After making one, say in one short line what is on the card and ask them to check it and tap Send — never say it was sent. Messages in [brackets] tell you what the person did with a card (sent, cancelled, undo). add_job_note and set_job_step happen right away and have Undo. Do nothing they did not ask for.",
    "Money: when asked what a job cost, use job_cost and give the total plus the parts (labor, material, travel) — it is the same as Reports → Job cost. Mention if some weeks are estimates (no paycheck yet), anyone with no pay info, and that payroll taxes and insurance are not included. job_cost works only for the owner and Payroll; for anyone else say costs are only for the owner and Payroll. Never give money numbers from anywhere else, and don't volunteer a person's hourly rate unless asked by the owner or Payroll.",
    "Material: when they ask for material, look up each item with find_material and prepare it with create_material_request (it goes to Menachem, like the Material screen, after they tap Send). Spoken amounts can be misheard ('$500 switches' = 500 switches; '12 to wire' / '12-2 wire' = 12/2 cable — the catalog writes it 12/2). Electrix uses Leviton. A 'roll' of 12/2 is a 250 ft coil; if it is not clear whether they mean Romex (NM-B) or MC, ask. If find_material marks an item company_default, use it without asking. Otherwise prefer the item the team asks for most (times_requested). If an item clearly matches one catalog item, use it; if several fit and the difference matters (e.g. switch type or color), ask one short question listing the choices; otherwise use it as written. Say in one line what is on the card and for which job.",
    "Spoken messages may end with what else the phone heard — use it to work out misheard words.",
    "You cannot delete, change hours or punches, send emails or messages outside the app — say so and point to the screen where they can do it.",
    ...(isLead(me) ? ["This person is a CREW LEADER in the field. Help them order material for their jobs, check where their material is, look at their jobs and add notes. They cannot see other people's hours, pay, costs or the schedule, and cannot make tasks — if asked, say that is for the office. Keep answers very short and simple; they usually speak Spanish."] : []),
  ].join("\n");
}

const NY = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
function buildPayload(me: any, messages: any[], today: string, lang: string) {
  const T2 = isLead(me) ? TOOLS.filter((t) => LEAD_TOOLS.has(t.name)) : TOOLS;
  const tools = T2.map((t, i) => i === T2.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t);
  // the newest part of the talk is cached too, so a long conversation is not counted again on every step (keeps us under the per-minute limit)
  const last = messages[messages.length - 1];
  const msgs2 = messages.slice(0, -1).concat([{ ...last, content: typeof last.content === "string" ? [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }]
    : (Array.isArray(last.content) ? last.content.map((c: any, i: number) => i === last.content.length - 1 ? { ...c, cache_control: { type: "ephemeral" } } : c) : last.content) }]);
  return { model: "claude-sonnet-5-5", max_tokens: 1500, system: system(me, today, lang), tools, messages: msgs2 };
}
async function claude(key: string, body: any): Promise<{ r: Response; j: any }> {
  let payload = JSON.stringify(body);
  let r: Response | null = null, j: any = {}, stripped = false;
  for (let k = 0; k < 3; k++) {   // busy / over the per-minute limit → wait a moment and try once more
    r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: payload });
    j = await r.json().catch(() => ({}));
    // safety net (e.g. a phone on the older app, or a talk left open past midnight): old thinking that no longer fits is left out and the step is asked again
    if (r.status === 400 && !stripped && /thinking/i.test(j?.error?.message ?? "")) {
      stripped = true; console.error("anthropic thinking mismatch — retrying without old thinking");
      const clean = body.messages.map((m: any) => Array.isArray(m.content) && m.role === "assistant" ? { ...m, content: m.content.filter((c: any) => c.type !== "thinking" && c.type !== "redacted_thinking") } : m).filter((m: any) => !Array.isArray(m.content) || m.content.length);
      payload = JSON.stringify({ ...body, messages: clean }); continue;
    }
    if (r.ok || ![429, 500, 503, 529].includes(r.status) || k === 2) break;
    const wait = Math.min(6, Math.max(2, Number(r.headers.get("retry-after")) || 3));
    await new Promise((res) => setTimeout(res, wait * 1000));
  }
  if (!r!.ok) console.error("anthropic", r!.status, j?.error?.type, j?.error?.message);
  return { r: r!, j };
}

// 🩺 Nightly self-check (pg_cron, ~3 AM): asks the real AI a 3-step question with made-up tool answers — the same instructions and tools
// the phones use, including the follow-up step that broke on 11/15. Result in server_config 'ask_check'; on failure the owner gets a push.
async function selfCheck(req: Request) {
  const adm = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await adm.from("server_config").select("k,v").in("k", ["secret", "anthropic_key", "functions_url"]);
  const cfg: Record<string, string> = {}; for (const x of rows ?? []) cfg[x.k] = x.v;
  if (!cfg.secret || req.headers.get("x-push-secret") !== cfg.secret) return json({ error: "no" }, 401);
  const key = Deno.env.get("ANTHROPIC_API_KEY") || cfg.anthropic_key || "";
  const t0 = Date.now(), me = { name: "Self-check", role: "owner" }, today = NY(t0 - 3 * 60000);
  const steps: string[] = []; let ok = true, err = "";
  try {
    if (!key) throw new Error("no AI key");
    const msgs: any[] = [{ role: "user", content: "Find the job 5 Glenbrook and tell me what step it is in." }];
    let { r, j } = await claude(key, buildPayload(me, msgs, today, "en"));
    if (!r.ok) throw new Error("step 1: " + r.status + " " + (j?.error?.message ?? ""));
    const u1 = (j.content ?? []).find((c: any) => c.type === "tool_use");
    if (!u1 || u1.name !== "find_jobs") throw new Error("step 1: did not search the jobs");
    steps.push("1 ok");
    msgs.push({ role: "assistant", content: j.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: u1.id, content: JSON.stringify([{ id: "t160", name: "5 Glenbrook", stage: "inspection", crew: "", match: 1 }]) }] });
    ({ r, j } = await claude(key, buildPayload(me, msgs, today, "en")));
    if (!r.ok) throw new Error("step 2: " + r.status + " " + (j?.error?.message ?? ""));
    let more = (j.content ?? []).filter((c: any) => c.type === "tool_use");
    // it may look at the job summary first — answer that too
    if (more.length) { msgs.push({ role: "assistant", content: j.content }, { role: "user", content: more.map((u: any) => ({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify({ name: "5 Glenbrook", stage: "inspection", crew: "", open_tasks: [], latest_notes: [] }) })) });
      ({ r, j } = await claude(key, buildPayload(me, msgs, today, "en"))); if (!r.ok) throw new Error("step 2b: " + r.status + " " + (j?.error?.message ?? "")); }
    const said = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
    if (!/finish|inspection|glenbrook/i.test(said)) throw new Error("step 2: answer did not name the step");
    steps.push("2 ok");
    msgs.push({ role: "assistant", content: j.content }, { role: "user", content: "Thanks. Now get 10 single pole switches there." });
    ({ r, j } = await claude(key, buildPayload(me, msgs, today, "en")));
    if (!r.ok) throw new Error("step 3 (follow-up): " + r.status + " " + (j?.error?.message ?? ""));
    if (!(j.content ?? []).some((c: any) => c.type === "tool_use" && /material/.test(c.name))) throw new Error("step 3: did not look up material");
    steps.push("3 ok");
  } catch (e) { ok = false; err = String((e as Error)?.message ?? e).slice(0, 300); }
  const res = { at: new Date().toISOString(), ok, err, steps, ms: Date.now() - t0 };
  await adm.from("server_config").upsert({ k: "ask_check", v: JSON.stringify(res) });
  if (!ok && cfg.functions_url) {
    const { data: owners } = await adm.from("records").select("id,data").eq("coll", "emps").eq("deleted", false);
    for (const o of (owners ?? []).filter((x: any) => x.data?.role === "owner" && !x.data?.inactive))
      await fetch(cfg.functions_url + "/notify", { method: "POST", headers: { "Content-Type": "application/json", "x-push-secret": cfg.secret },
        body: JSON.stringify({ to: o.id, msg: "⚠️ Electrix Assistant self-check failed: " + err.slice(0, 120), ts: Date.now() }) }).catch(() => {});
  }
  return json(res);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("x-push-secret")) return await selfCheck(req);
  if (req.method !== "POST") return json({ error: "POST" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: me } = await sb.rpc("my_emp_data");
  if (!me || !me.id || me.inactive) return json({ error: "not allowed" }, 401);
  if (!["owner", "manager", "office"].includes(me.role) && !me.all && !isLead(me)) return json({ error: "not allowed" }, 403);
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
  // The instructions must stay word-for-word the same for the whole conversation: the AI's saved thinking from earlier steps is tied to them,
  // and a changed clock minute made Anthropic refuse the next step ("Could not reach Ask", 11/15). So the time is the conversation's start time.
  const st = Number(body.started), now = Date.now();
  const t0 = st && st <= now + 60000 && st > now - 86400000 ? st : now;
  const today = NY(t0);
  const { r, j } = await claude(key, buildPayload(me, messages, today, body.lang === "es" ? "es" : "en"));
  if (!r.ok) {
    const msg = j?.error?.message ?? "ai error";
    const busy = [429, 500, 503, 529].includes(r.status);
    return json({ error: msg, status: r.status, busy, wait: Number(r.headers.get("retry-after")) || 0 }, busy ? 503 : 502);
  }
  return json({ content: j.content ?? [], stop_reason: j.stop_reason });
});
