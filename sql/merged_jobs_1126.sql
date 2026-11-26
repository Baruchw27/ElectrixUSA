-- Baruch 11/26: crew 4 was booked on the old 379 Anderson (a merged-away copy that stayed in the app).
-- (1) A job that has been merged into another (data.mergedInto) is removed for real (deleted = true, kept in history).
-- (2) A schedule saved with a merged-away job is moved to the job that was kept (follows the merge chain, up to 5 steps).
create or replace function private.site_merge_target(p_id text) returns text language plpgsql stable security definer set search_path to 'public' as $f$
declare cur text := p_id; nxt text; i int := 0;
begin
  if p_id is null then return null; end if;
  loop
    select data->>'mergedInto' into nxt from records where coll = 'sites' and id = cur;
    exit when nxt is null or nxt = '' or nxt = cur or i >= 5;
    cur := nxt; i := i + 1;
  end loop;
  return cur;
end $f$;

create or replace function private.records_merged_jobs() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare t text;
begin
  if new.coll = 'sites' then
    if coalesce(new.data->>'mergedInto', '') <> '' and not new.deleted then new.deleted := true; end if;
  elsif new.coll = 'sched' and new.data is not null then
    if new.data ? 'site' then
      t := private.site_merge_target(new.data->>'site');
      if t is distinct from new.data->>'site' then new.data := new.data || jsonb_build_object('site', t); end if;
    end if;
    if jsonb_typeof(new.data->'assignments') = 'array' then
      new.data := jsonb_set(new.data, '{assignments}', (select coalesce(jsonb_agg(case when a ? 'site' and private.site_merge_target(a->>'site') is distinct from a->>'site'
                    then a || jsonb_build_object('site', private.site_merge_target(a->>'site')) else a end order by o), '[]'::jsonb)
                  from jsonb_array_elements(new.data->'assignments') with ordinality x(a, o)));
    end if;
  end if;
  return new;
end $f$;

drop trigger if exists records_merged_jobs on public.records;
create trigger records_merged_jobs before insert or update on public.records
  for each row when (new.coll in ('sites', 'sched')) execute function private.records_merged_jobs();
