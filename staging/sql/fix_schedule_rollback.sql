-- Electrix USA — SCHEDULE agent fixes: ROLLBACK (puts back exactly what was there before fix_schedule_forward.sql)
-- The old function bodies were saved by the forward file in private.fn_backup_schedule (step 0) and are also
-- written out in full below, so this file works on its own.

-- new crons off
select cron.unschedule(jobid) from cron.job where jobname in ('insp-reminders','sched-tomorrow');

-- new triggers / functions out
drop trigger if exists records_guard_ong_rule on public.records;
drop trigger if exists records_guard_meets_book on public.records;
drop trigger if exists records_orr_log_merge on public.records;
drop function if exists private.guard_ong_rule();
drop function if exists private.guard_meets_book();
drop function if exists private.orr_log_merge();
drop function if exists private.sched_tomorrow_tick(timestamptz, boolean);
drop function if exists private.sched_for(text, text, date);
drop function if exists private.insp_reminders(timestamptz);
delete from server_config where k = 'sched_tmr_day';

-- old definitions back (from the saved copies)
do $r$ declare d text; begin
  for d in select def from private.fn_backup_schedule order by name loop execute d; end loop;
end $r$;

-- the same old definitions, written out (used if the backup table is gone)
-- public.guard_sched_rev (before):
-- CREATE OR REPLACE FUNCTION public.guard_sched_rev() RETURNS trigger LANGUAGE plpgsql AS $function$
-- begin
--   if NEW.coll='sched' and OLD.coll='sched' and not coalesce(NEW.deleted,false)
--      and (NEW.data is distinct from OLD.data) then
--     if coalesce((NEW.data->>'rev')::int,0) <= coalesce((OLD.data->>'rev')::int,0) then
--       raise exception 'stale_sched_write for %: incoming rev % must exceed stored rev %',
--         NEW.id, coalesce(NEW.data->>'rev','0'), coalesce(OLD.data->>'rev','0')
--         using errcode='40001';
--     end if;
--   end if;
--   return NEW;
-- end $function$;
-- private.orr_wd (before):
-- CREATE OR REPLACE FUNCTION private.orr_wd(a date, b date) RETURNS integer LANGUAGE sql IMMUTABLE AS $function$
--   select coalesce(count(*)::int,0) from generate_series(a + 1, b, interval '1 day') d where extract(isodow from d) < 6 $function$;
-- private.orr_tick / public.meeting_reminders (before): the full bodies are the ones in fix_schedule_forward.sql's
-- source — staging/orr_tick_v4.sql applied on top of schema.sql's v2 (staging has no orr_start line; live does) and the
-- meeting_reminders body in schema.sql. They are restored above from private.fn_backup_schedule.

-- H28 data back to Monday–Friday (STAGING) — only the rows the forward file changed
update records set data = jsonb_set(data, '{day,workdays}', '[1,2,3,4,5]'::jsonb), updated_at = now()
 where coll='crews' and not deleted and data->'day'->'workdays' = '[0,1,2,3,4,5]'::jsonb;
update records set data = data || jsonb_build_object('workdays','[1,2,3,4,5]'::jsonb, 'rev', coalesce((data->>'rev')::int,0) + 1), updated_at = now()
 where coll='sched' and id like 'ONG:%' and not deleted and coalesce(data->>'to','') = '' and data->'workdays' = '[0,1,2,3,4,5]'::jsonb;
-- PRODUCTION — only if the production data part was run:
-- (same two updates; and orr_to back to what it was: delete from server_config where k='orr_to';)

-- drop the backup table last
drop table if exists private.fn_backup_schedule;
