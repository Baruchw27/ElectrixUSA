-- JOBS agent rollback (staging rkkxykdkjgdsgkujanau). Undoes fix_jobs_forward.sql.
-- on_record_change and private.p3_due below are the definitions in place before the change
-- (identical to production on 2026-10-28, md5-checked).

begin;

select cron.unschedule('pri-hourly') where exists (select 1 from cron.job where jobname = 'pri-hourly');
drop function if exists private.pri_tick(timestamptz);

drop trigger if exists records_guard_site_stage on public.records;
drop function if exists private.guard_site_stage();
drop trigger if exists records_guard_task_insp on public.records;
drop trigger if exists records_zz_task_insp_check on public.records;
drop trigger if exists records_zz_insp_close_tasks on public.records;
drop function if exists private.guard_task_insp();
drop function if exists private.insp_close_tasks();

drop function if exists public.job_perms();
drop function if exists private.can_move_stage(jsonb);
drop function if exists private.can_assign_mgr(jsonb);
drop function if exists private.cfg_ids(text);
drop function if exists public.merge_sites(text, text, boolean);
drop function if exists public.unmerge_sites(bigint);
drop function if exists private.swap_site(jsonb, text, text);
drop function if exists public.trello_apply_sites(jsonb);
drop table if exists private.merge_log;

delete from public.server_config where k in ('stage_movers', 'mgr_assigners');

CREATE OR REPLACE FUNCTION public.on_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare base text; secret text;
begin
  if new.deleted or new.coll not in ('inbox','sites') then return new; end if;
  if new.coll = 'inbox' and tg_op <> 'INSERT' then return new; end if;
  if new.coll = 'sites' and (tg_op <> 'UPDATE' or coalesce(new.data->>'stage','') = coalesce(old.data->>'stage','') or coalesce(new.data->>'trello','') = '') then return new; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  if new.coll = 'inbox' then
    perform net.http_post(url := base || '/notify',
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg', 'id', new.id,
                                 'ts', case when (new.data->>'ts') ~ '^[0-9]+$' then (new.data->>'ts')::bigint end),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.p3_due(d jsonb)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when coalesce(d->>'due','') in ('Today','ASAP') then b
    when d->>'due' = 'Tomorrow morning' then b + 1
    when d->>'due' = 'This week' then b + ((5 - extract(dow from b)::int + 7) % 7)
  end
  from (select (to_timestamp(coalesce(nullif(d->>'ts','')::bigint, 0)/1000.0) at time zone 'America/New_York')::date as b) x
$function$;

commit;
