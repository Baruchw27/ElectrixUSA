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
  (none while a clock-in waits for approval).
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
