# Automatic time clock (OwnTracks) — the full checklist

Read this before setting up ANY new person or crew on the app clock, and before answering any tracker question.
Everything here was learned on crew 5 (Nov 11–19 2026). Do not drop a step because it "should" be automatic.

## 1. Turn a person on (office side)
- `emps.data.appClock = true` and `emps.data.otMove = true` (5-minute Move mode during work hours).
- He needs a Fingercheck number in `rates` (fc + co) so his app hours and travel can be sent.
- His jobs need a GPS fence (lat/lng/rad). Small fences (150 ft) cause "not at the job" — 300 ft is normal.
- Every clock rule keys on `appClock` only — nothing is tied to crew 5. No other setting is needed.

## 2. Phone steps — EVERY phone, no exceptions
(Since live vh101c1119 the setup link turns Android Remote configuration on by itself and the Punch-page setup card lists all
of these steps in English and Spanish. Still check each phone.)
Tell the men in Spanish, one message, both phone types:

**iPhone**
1. Install OwnTracks, open it once.
2. OwnTracks → ⓘ (top left) → Settings → scroll to the bottom → Remote Control:
   turn ON **"Allow external configuration"** AND **"Remote configuration"** (Baruch: crew 5 turned on remote configuration on iPhones too — keep it ON).
   Without "Allow external configuration" the iPhone ignores the Connect link completely.
3. Back in the Electrix app → Punch → Automatic time clock → **Connect**.
4. iPhone Settings → OwnTracks: Location **Always**, **Precise** ON, **Background App Refresh** ON.
5. iPhone Settings → Battery: **Low Power Mode OFF**.
6. Never swipe OwnTracks closed (a closed iPhone app only wakes on a region event or when opened).
   Mayquin 11/19: app not closed but paused for 1 h 30 min (no signal at 220 Prospect) — opening it sent everything.

**Android**
1. Install OwnTracks. Electrix app → Punch → Automatic time clock → **Connect**.
2. OwnTracks → ☰ → Preferences → Advanced → **Remote configuration ON**, and **external configuration ON** too
   (Baruch 11/19: external configuration is needed on Android as well, not only iPhone).
   Without it the phone IGNORES every setting the server sends (5 min, 250 m, interval lock). Baruch turned it on by hand for Shauly 11/18.
3. Phone settings → Apps → OwnTracks → Battery: **Unrestricted** (not optimized); battery saver OFF.
4. Location permission: **Allow all the time** + **Precise**.
   Check in OwnTracks Status: "Location permissions granted: Precise (available in background)" and Doze whitelist = yes.
5. Never swipe it closed.

**Mode must be HTTP** (not MQTT). The Connect link sets it.

Do NOT turn on "Allow remote location" (server asking for a position on demand) — off on purpose: it can't reach a stopped phone
over HTTP and goes against Baruch's rule (a time clock, not tracking). "Allow intent control" = other apps/Shortcuts controlling
OwnTracks on the same phone; not needed.

## 3. What the server sends by itself (owntracks function)
- On every report the reply carries `setConfiguration` once per change (tag in ot_tokens.wp_hash, now `|m:move250`):
  `monitoring:2, locatorInterval:300, moveModeLocatorInterval:300, locatorDisplacement:250, pegLocatorFastestIntervalToInterval:true`
  during the work window, normal mode outside it; plus the list of his jobs (waypoints) incl. ongoing job and moves (L: rows).
- Work window: Mon–Thu 7:00–20:00, Fri 7:00–14:15, Sunday only if booked, never Saturday / day off; kept late → until 1 h after Send home.
- The job list is wiped/reloaded ONLY when his jobs change; a mode switch (7 AM / 8 PM) sends only setConfiguration (11/19 —
  reloading it while he stood inside a job made iPhones miss arrive/leave).
- locatorDisplacement 0 floods the server (every 3–6 s) — never use 0.

## 4. Clock rules (all automatic for appClock people)
- Tracker never starts the day — he punches in himself. 5-min "punch in" reminder when at a job and not punched in
  (none while a clock-in waits for approval). A clock-in waiting for approval counts as on the clock (switch / away work);
  it also closes by itself like any punch (clock_tick, 11/19). The server's 'where is he scheduled' = private.man_sched_site
  (his own L: booking first, then a changed day, then the crew's job).
- Job on his schedule that day → switch on the first report. Job not on his schedule → 5 min + second report.
- (11/19) A reading is used if it is NEW (newer than the newest one already handled), however late, with its own phone time;
  a repeat of a reading already handled is dropped (Android re-sends its last fix); other-day / >12 h readings dropped.
  Bursts are handled in order: same place → only 'last seen', a new job / leaving → counted at its real time.
  'Punch in' reminders only from fresh readings (≤15 min). Needs private.ot_tokens.last_tst + public.ot_tst (sql/ot_tst.sql).
- Away > 1 h → clock closes at the time he left. Open punch closed 1 h after day end at last seen time.
- 🏠 pack-up message 15 min before day end, not to men kept late; kept late after it → "ignore the go-home message".
- Punch saved on the phone with no signal and sent late → waits for Payroll approval (lateEntry).

## 5. Known phone behaviour
- iPhone Move mode: timer every locatorInterval, reports even when still — needs Always + not closed + not Low Power.
- Android: ping is a WorkManager job (min 15 min) that re-sends the LAST location with its old time; with remote config off
  or battery optimized it reports only every ~15 min (Shauly).
- Wi-Fi-only phones (Shia) report nothing away from Wi-Fi; they queue and send when back.
- Bad-service jobs (220 Prospect) delay punches and reports — don't judge a phone by that job.

## 6. Checking a phone
- private.ot_tokens.last_at = last report; ot_events only logs decisions (not every report).
- Report frequency per phone: function_edge_logs for /functions/v1/owntracks grouped by user agent + IP, matched to last_at.
- Positions are never stored. Never use the tracker to rebuild a commute.

## 7. Lessons
- 11/19 Mario: OwnTracks swiped closed → nothing from 8:48 to 1:17 PM. Keeping it open is the #1 rule.
- 11/19 Shauly: every report all day carried a GPS reading from the day before (4:18 PM 11/18) — the phone was not getting
  new fixes at all (location permission / precise / battery). Check last_tst vs last_at: if last_tst is hours old while
  last_at is fresh, the phone is reporting but its GPS is stuck.

## 8. OwnTracks reminders (11/19, cron 'ot-nudge' every 5 min → private.ot_nudge_tick, sql/ot_nudge.sql)
- 8:00 AM workdays (not Sat / day off; Sunday only if booked): 'make sure OwnTracks is open, don't swipe it closed'.
- On the clock + no NEW reading (last_tst) for 1 hour during the workday (or kept late): 'open OwnTracks once' — once per quiet stretch.

## 9. Early start — a day booked before 8:00 (live 11/19: app vh107, owntracks v14 = commit e5ee089, sql/early_start.sql)
- Book it in Schedule (crew ⋯ → Send to another job → At a time e.g. 6:30 AM → Rest of the day, or a man's own booking).
- private.man_sched_start(emp, crew, day) = earliest booked start that day (his own L: booking, else the crew day row), never later than 8:00.
- Pay (app time cards/totals): counted from the booked start instead of 8:00. Fingercheck always gets the raw punch times.
- Reminders: "open OwnTracks" at the booked start; "punch in" at booked start + 5 min; the 1-hour no-location check runs from the booked start.
- Tracker: the 5-minute Move reports start 1 hour before the booked start (normal days: 7:00).
- Days with nothing booked before 8:00 work exactly as before.

## 10. Only jobs that are in the app (live 11/19 midnight, owntracks v15 = commit 55ee6a1)
- The tracker uses only jobs that show in the app. Lost bids (stage "lost" — Trello "Lost Bids", ~160, hidden in the app) and
  finished jobs ("done") are ignored: never sent to the phone to watch, never "arrived", never a punch-in reminder.
  (Exception: a job someone is already clocked in at is always watched.)
- Why: 11/19 7 AM Lennin got "you are at 107-115 Bethune Blvd, punch in" — a lost bid next to where he lives.

## 11. Go home at / Stay late till when (live 11/20 00:25: app vh108, owntracks v16 = commit 9765c47, sql/go_home_at.sql + sql/stay_late_until.sql)
- Send to another job → Until? → "Go home at" a time: the booking gets home = true and that end. private.man_sched_end(emp,crew,day)
  = that time (his own booking first, else his crew's day booking if he has none), else the normal end (7:00 PM, Fri 1:15 PM).
  Only home = true counts — old bookings carry leftover end times from the old crew hours and are ignored.
  Follows it: 🏠 pack-up message 15 min before, "still punched in" 5 min after, automatic close 1 h after, OwnTracks 1-hour check
  until it, tracker 5-minute reports until 1 h after it.
- Stay late → "Till when?": "I'll send them home" (as before) or "Until a time" (goHomeLog 'late' gets until = minutes). 15 min before
  that time clock_tick sends the same 🏠 "Pack up — go home in 15 minutes" message, writes a goHomeLog 'home' record (by: server) and
  goHome on his open punch — exactly what Send home does. A manual Send home or a new Stay late wins (the day's LAST record counts).

## 12. "You are at the job — punch in" reminder (live 11/20 morning)
- At his job 5 min and not punched in → 1st reminder. Still not punched in 30 min later → 2nd reminder. 15 min after the 2nd →
  ONE message to Shia (o1), Baruch (u1) and the site manager(s) of THAT job (job folder managers; else his crew's manager):
  "<name> has been at <job> since <time> and is not punched in, or his punch hasn't reached us yet (no signal?). He was reminded twice."
  Then nothing more for that job that day.
- The reminder also says "Already punched in? Open the app where you have signal so it gets sent." (live 11/20 9:31, owntracks v18):
  a punch made with no signal waits on the phone until the app is open WITH signal (11/20: Mayquin punched 7:06, it arrived 7:29).
  The server can't know about a punch that hasn't arrived, so reminders can still go out after a man really punched.
- Why: 11/20 Lennin got the reminder 9 times between 7:31 and 8:57 and never punched in.

## 13. Android: punches made with no signal send themselves (live 11/20 10:35, app vh110, punchsync v1, sql/bg_punch.sql)
- A punch made with no signal waits on the phone. On ANDROID the app's helper (sw.js, Background Sync) sends it to the
  "punchsync" function by itself as soon as there is signal, even with the app closed. iPhones don't allow this — for them
  the reminder says "Already punched in? Open the app where you have signal so it gets sent."
- Each phone gets a punch key (public.bg_key_register) the first time the updated app is open WITH signal; it can only save
  that person's own punches, through the same server checks (saved AS him: late → waiting for approval, no 2nd open punch).
  Sign-out turns the key off (bg_key_drop). Keys: private.bg_keys (last_used shows when a phone used it).
- With the app open on screen the helper does nothing (the app sends). What the helper sent is taken off the app's list
  when it opens (bgAdopt) — nothing is sent twice. Punches with a photo are left for the app.

## 14. iPhones + fewer wrong reminders (live 11/21 night, app vh111, owntracks v19, sql/office_no_punch_reminders.sql)
- iPhones: every notification that reaches the phone wakes the app's helper for a few seconds and it sends the punches waiting
  on the phone (sw.js push → bgPush). Needs the app INSTALLED on the home screen + notifications allowed. Every phone (not only
  Android) now gets a punch key; the helper finds its app's database by its scope (IndexedDB 'ex_bg_reg').
- "You are at the job — punch in": never for office people / the owner (role office/owner, i.e. Shia), and none after the
  workday — 7:00 PM, Friday 1:15 PM, or the "Go home at" time — unless kept late with Stay late.
- Server: the 8:05 "Time to punch in" reminder and the 8:30 "not punched in yet" list leave out office/owner too.
- (11/21 night, sql/ot_quiet_not_punched.sql) The "OwnTracks has not sent your location for 1 hour" message also goes to a man
  BOOKED today but NOT punched in, counted from his booked start (once per quiet spell; office/owner left out). 11/20: Luis
  Guillen's punch was stuck on his phone and his OwnTracks died at 7:07 — nobody heard anything until 11:11.

## 15. Phone battery on the payroll Today page (live 11/22 2:40 AM: app vh112, owntracks v20 = commit 533a800, sql/ot_battery.sql)
- OwnTracks sends `batt` (battery %) and `bs` (0 unknown, 1 unplugged, 2 charging, 3 full) with every location report. Nothing
  to set on the phones. The tracker now keeps the newest one: owntracks calls `ot_batt` (service role only) after the login
  check; an older report never overwrites a newer one. Columns private.ot_tokens.batt / bs / batt_at; ot_report returns them.
  SQL: sql/ot_battery.sql (applied to staging and live 11/22, before owntracks v20).
- Today (p24.js): a small red "7%" on the corner of his circle when it is 15% or less, not charging, read in the last
  2 hours, and he is working or booked. Tapping him shows the battery in the grey panel. Nothing under the circle (Baruch 11/22).
- Only men with OwnTracks (appClock) have a battery. Test: /home/claude/work/ott/run11.mjs.

## 16. Schedule: "Every workday" = Monday–Friday (live 11/22 5 AM, app vh116)
- Ongoing ("until I change it" / "Every workday") bookings repeat Monday–Friday only; Sunday is booked by hand. Crews 1 and 5's
  ongoing jobs had Sunday in them (that is why crew 1 showed booked on Sunday 11/22) — changed to Mon–Fri 11/22.
  The tracker's punch-in reminders and the 8:05 / 8:30 server reminders follow the schedule, so a crew not booked on Sunday
  gets no Sunday reminders.
- Booking is done on the crew card now (p26): ⋯ = Edit · Add another job · Copy; swipe right = Send; every save writes the whole
  day (no pieces on top of old ones). Same records as before (crew|day, ONG:crew:id, L:man|day).

## 17. Waiting punches always go to the background helper (live 11/22 1 PM, app vh119)
- 11/22: Carlos punched in at 8:06 on a weak signal. The phone still said "online", so the app kept the punch to itself (the
  helper only got punches when the phone said "offline"); the send failed, the app went to the background, and the helper had
  nothing — every notification woke it with nothing to send (0 punchsync calls all day). It arrived at 11:50 when he opened the app.
- Now (sync.js): every waiting punch is handed to the helper right away, again after any send that didn't get everything out,
  and again the moment the app goes to the background. Android keeps retrying by itself (Background Sync); iPhone sends on the
  next notification. The helper never sends while the app is open, and the app takes back what the helper already sent.
- How to check a "stuck" punch: private.devices (pending, last_at per phone), private.bg_keys.last_used, edge logs for
  /functions/v1/punchsync, records_history for the punch insert.

## 18. A late report reopens a clock the server closed by mistake (live 11/22 4:43 PM: owntracks v21 = commit a60e58d)
- What happened (Carlos, Sun 11/22): he left 220 Prospect at 12:59 PM and was back at 1:30, but his phone's reports reached the
  server only at 2:54. At 2:00 the server closed his clock at 12:59 ("left and not back within 1 hour"). The late arrival
  changed nothing because there was no open clock any more. His punch was reopened by hand at 4:40 PM.
- Rule now (owntracks `reopenIfBack`, called from `arrived()` when he has no open clock): a punch closed by the server with
  autoClosed.how = "left", same job, same day, and no newer punch since →
  - back within 1 hour of leaving → the SAME punch opens again; the time away is a trip (left/back), like any short run;
    `reopened` keeps what the server had done; he gets "✅ You were back at … — your clock is open again".
  - back after more than 1 hour → the clock stays closed; Payroll (server_config clock_check_to) gets one message to check
    his card (`lateBackTold` stops repeats).
- Late is never thrown away (rule from 11/19): only repeats and reports older than 12 h / another day are dropped.

## 19. How Claude answers "where is everyone / the tracker / punches" (Baruch 11/22 10 PM)
Three wrong answers in one day came from looking in only one place. ALWAYS run `sql/status_check.sql` (read only; change the
day on its first line) and answer from all of it:
- **Tracker last seen = `private.ot_tokens.last_at`** — every OwnTracks report. It is exactly what the app's Time cards
  screen shows ("Tracker last seen", `public.ot_report`). The app was right; I was wrong.
- **Never use `private.devices.last_at` for the tracker.** It is only when the app last synced. I said Fernando's and
  Carlos's phones were silent from 9 AM / 5 PM while their trackers worked.
- **The punch itself** holds what the phone saw: `away` (left the job), `seen`, `trips`, `autoClosed`, `keepOpen`.
  Luis Guala's "left 7:07 PM" was on his punch, not in the tracker events.
- **A punch made with no signal reaches the office later** (`offline:true`; `devices.pending > 0` = still waiting on the
  phone). Fernando punched out at 7:05 PM, it arrived at 9:23 PM. So an OPEN punch with a quiet tracker = say
  "his punch-out may not have arrived yet", never "he is still clocked in".
- **A late tracker report** can reopen a clock (section 18) — same caution about calling anything final.

## 20. Back at the job after the server closed his clock — every source counts (live 11/23 1:05 PM: app vh127, owntracks v22 = commit af1bda0, sql/back_on_job_1123.sql)
Baruch 11/23 (Luis Guala: left 213 NY-59 at 8:33, clock closed, his phone's GPS saw him back at 11:05 — nothing happened because
only the tracker could reopen a clock): "If it sees them back on a job, whatever way, it should catch it up."
- ONE server rule `private.back_on_job(who, site, at, src)`. Fed by: the tracker (owntracks `reopenIfBack` → `public.ot_back`),
  and his phone's GPS in the app (`seen` / `backSeen` on the closed clock → `private.back_sweep` inside clock_tick every 5 min).
- Only a clock the server/phone closed because he LEFT (`autoClosed.how='left'` or `autoOut`), same job, same day, before the
  workday end (or while kept late, before the stay-late time). Once per clock (`backDone`). He punched out himself → nothing.
- Back within 1 hour → the same clock opens again (the time away = a trip). Back after more than 1 hour → a NEW clock from the
  time he was seen back (`auto:'back'`, `backFrom`); the time away is not paid; he and Payroll (clock_check_to) are told.
