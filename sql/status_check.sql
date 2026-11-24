-- WHERE IS EVERYONE — the one check to run whenever Baruch asks about the tracker or punches (READ ONLY).
-- Rule (Baruch 11/22): never answer from one place. A man's day is in THREE places:
--   1) the punch itself: in / out / away (phone saw him leave) / seen (last seen on site) / trips / autoClosed / keepOpen / offline
--   2) the tracker list (private.ot_events: arrive / leave)
--   3) TRACKER LAST SEEN = private.ot_tokens.last_at — every OwnTracks location report. This is what the app's
--      Time cards screen shows ("Tracker last seen", public.ot_report). Use THIS for "is his tracker working".
--      NEVER use private.devices.last_at for that: it is only when the app last synced (Baruch 11/22: I said phones
--      were silent from 9 AM while the app showed the tracker working all day).
--   4) a punch made with no signal waits on the phone (devices.pending > 0) and reaches the office later
-- If a phone has not been heard from since before the moment you are talking about, SAY SO: "may not have arrived yet".
-- Change the day on the first line only.
with prm as (select '2026-11-22'::date as day),
b as (select (extract(epoch from (day::timestamp at time zone 'America/New_York'))*1000)::bigint s,
             (extract(epoch from ((day+1)::timestamp at time zone 'America/New_York'))*1000)::bigint e,
             day::timestamp at time zone 'America/New_York' ts0, (day+1)::timestamp at time zone 'America/New_York' ts1 from prm),
emps as (select id, data->>'name' n, data->>'crew' crew, coalesce((data->>'appClock')::boolean,false) app
         from records where coll='emps' and not deleted and not coalesce((data->>'inactive')::boolean,false)
           and not coalesce((data->>'terminated')::boolean,false) and coalesce(data->>'role','') not in ('office','owner')),
pu as (select r.data->>'who' who, string_agg(
         to_char(to_timestamp(_num(r.data->>'in')/1000.0) at time zone 'America/New_York','HH12:MI AM') || ' → ' ||
         coalesce(case when jsonb_typeof(r.data->'out')='number' then to_char(to_timestamp(_num(r.data->>'out')/1000.0) at time zone 'America/New_York','HH12:MI AM') end, 'OPEN') ||
         coalesce(' @ ' || split_part((select s.data->>'name' from records s where s.coll='sites' and s.id=r.data->>'site'),',',1), '') ||
         coalesce(' · left ' || to_char(to_timestamp(_num(r.data->>'away')/1000.0) at time zone 'America/New_York','HH12:MI AM'), '') ||
         coalesce(' · last seen ' || to_char(to_timestamp(_num(r.data->>'seen')/1000.0) at time zone 'America/New_York','HH12:MI AM'), '') ||
         case when jsonb_array_length(coalesce(r.data->'trips','[]'::jsonb))>0 then ' · trips ' || jsonb_array_length(r.data->'trips') else '' end ||
         case when r.data ? 'autoClosed' then ' · AUTO-CLOSED (' || (r.data->'autoClosed'->>'how') || ')' else '' end ||
         case when coalesce((r.data->>'offline')::boolean,false) then ' · made OFFLINE, reached office ' || to_char(r.updated_at at time zone 'America/New_York','HH12:MI AM') else '' end ||
         case when _num(r.data->>'keepOpen') > (extract(epoch from now())*1000) then ' · held open' else '' end
       , ' | ' order by _num(r.data->>'in')) p
       from records r, b where r.coll='punches' and not r.deleted and r.data->>'voided' is null and _num(r.data->>'in') >= b.s and _num(r.data->>'in') < b.e group by 1),
ev as (select who, count(*) n,
         array_to_string((array_agg(kind || ' ' || to_char(at at time zone 'America/New_York','HH12:MI') || coalesce(' ' || split_part((select s.data->>'name' from records s where s.coll='sites' and s.id=e.site),',',1),'') order by at desc))[1:6], ' ← ') list
       from private.ot_events e, b where at >= b.ts0 and at < b.ts1 group by who),
tk as (select who, last_at, batt, batt_at from private.ot_tokens),
dv as (select who, sum(pending) pending from private.devices group by who),
ap as (select who, site, at from private.app_seen)   -- 5) where the Electrix app last saw him (job or none), see TRACKER_SETUP §21
select e.crew, e.n, case when e.app then 'app clock' else 'no app clock' end clock,
       coalesce(pu.p, '— no punch') punches,
       coalesce(ev.n || ' events, newest first: ' || ev.list, '— no tracker events') tracker,
       coalesce(to_char(tk.last_at at time zone 'America/New_York','Dy HH12:MI AM'), 'no tracker') tracker_last_seen,
       case when ap.at is not null then coalesce(split_part((select s.data->>'name' from records s where s.coll='sites' and s.id=ap.site),',',1),'not at any job') || ' · ' || to_char(to_timestamp(ap.at/1000.0) at time zone 'America/New_York','HH12:MI AM') end app_last_saw,
       case when tk.batt is not null then tk.batt || '%' || ' (' || to_char(tk.batt_at at time zone 'America/New_York','HH12:MI AM') || ')' end battery,
       case when dv.pending > 0 then dv.pending || ' WAITING ON PHONE' else '' end ||
       case when pu.p like '%OPEN%' and (tk.last_at is null or tk.last_at < now() - interval '40 minutes') then ' ⚠ open punch + tracker quiet: a punch-out made with no signal may not have arrived yet' else '' end ||
       case when pu.p is null and ev.n > 0 then ' ⚠ tracker saw him working but NO punch' else '' end flags
from emps e left join pu on pu.who=e.id left join ev on ev.who=e.id left join tk on tk.who=e.id left join dv on dv.who=e.id left join ap on ap.who=e.id
where e.app or pu.p is not null or ev.n > 0
order by e.crew nulls last, e.n;

-- 6) (Baruch 11/23, once sql/ot_reads_1123.sql is live) every location reading of one man today — how sure the phone was,
--    how far from the job he was clocked in at and from the nearest job, and what the server did. No position is kept.
-- select to_char(at at time zone 'America/New_York','HH12:MI:SS AM') t, acc, open_site, open_m, open_fence,
--        near_site, near_m, note from private.ot_reads where who = 'u16' and at >= current_date order by at;
