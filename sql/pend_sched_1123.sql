-- Baruch 11/23 (Luis Guala 8:18 PM): "if a job is on his schedule, even though the tracker only sees him once there, it should
-- clock him in." The tracker saw him at 18 Golf Course at 8:18; the move to Golf Course was put on the schedule at 8:22. At 8:18
-- the job was not on his schedule yet, so the reading waited for a 2nd report — and nothing looked again when the schedule changed.
-- Now every 5 minutes (clock_tick) a waiting tracker reading (private.ot_pending, last 2 hours, today) is checked again: if that
-- job is on his schedule NOW, the same switch rule runs (private.app_switch: switch from when he left the other job, or start
-- his clock there), no 2nd report needed.
create or replace function private.on_sched(p_who text, p_site text, p_day text) returns boolean
language sql stable security definer set search_path to 'public' as $f$
  select p_site is not null and (
    exists (select 1 from records l, jsonb_array_elements(case when jsonb_typeof(l.data->'assignments')='array' then l.data->'assignments' else '[]'::jsonb end) a
            where l.coll='sched' and not l.deleted and l.id = 'L:' || p_who || '|' || p_day and a->>'site' = p_site)
    or exists (select 1 from records e, records c, jsonb_array_elements(case when jsonb_typeof(c.data->'assignments')='array' then c.data->'assignments' else '[]'::jsonb end) a
            where e.coll='emps' and e.id = p_who and c.coll='sched' and not c.deleted and c.id = (e.data->>'crew') || '|' || p_day and a->>'site' = p_site)
    or private.man_sched_site(p_who, (select data->>'crew' from records where coll='emps' and id = p_who), p_day) = p_site) $f$;
revoke all on function private.on_sched(text,text,text) from public, anon, authenticated;

create or replace function private.pend_sweep(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path to 'public' as $f$
declare r record; n int := 0; s text; nowms bigint := (extract(epoch from p_now)*1000)::bigint; d text;
begin
  for r in select p.who, p.site, p.at from private.ot_pending p
      where coalesce(p.site,'*') <> '*' and p.at is not null and p.at >= nowms - 2*3600000 and p.at <= nowms
        and coalesce((select (data->>'appClock')::boolean from records where coll='emps' and id = p.who), false) loop
    d := to_char(to_timestamp(r.at/1000.0) at time zone 'America/New_York','YYYY-MM-DD');
    if private.on_sched(r.who, r.site, d) then
      s := private.app_switch(r.who, r.site, r.at);
      if s <> '' then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $f$;
revoke all on function private.pend_sweep(timestamptz) from public, anon, authenticated;

do $d$
declare s text := pg_get_functiondef('private.clock_tick'::regproc); a text;
begin
  if position('pend_sweep' in s) > 0 then return; end if;
  a := E'  perform private.back_sweep(p_now);';
  if (length(s) - length(replace(s, a, ''))) / length(a) <> 1 then raise exception 'back_sweep line not found once'; end if;
  s := replace(s, a, a || E'\n  perform private.pend_sweep(p_now);   -- Baruch 11/23: a waiting tracker reading at a job that is on his schedule now');
  execute s;
end $d$;
