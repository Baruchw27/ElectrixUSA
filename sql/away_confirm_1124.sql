-- Baruch 11/24: "the server should wait for the next report. If the next report confirms that he's not in, then it's
-- gonna punch him out." A clock is closed at the time he LEFT only when a NEW reading from at least 1 hour after he left
-- shows him still away (outside the job and not at another job). A silent phone keeps the clock open; 1 hour after he left
-- Baruch (u1) + Payroll (clock_check_to) get ONE message. At the day's close-out (clock_due) a still-unconfirmed clock
-- closes at the time he left, marked autoClosed.unconfirmed, and the morning list says so.

create or replace function private.away_confirmed(p_who text, p_site text, p_aw bigint) returns boolean
language sql stable security definer set search_path to 'public', 'private' as $$
  select exists (select 1 from private.ot_reads r
                  where r.who = p_who and r.at >= to_timestamp((p_aw + 3600000) / 1000.0)
                    and r.open_site is not distinct from p_site and r.open_m is not null
                    and r.open_m - coalesce(r.acc, 0) > greatest(coalesce(r.open_fence, 100), 100)      -- surely outside his job
                    and (r.near_site is null or r.near_site = p_site or r.near_m - coalesce(r.acc, 0) > 152))  -- and not at another job
      or exists (select 1 from private.app_seen a where a.who = p_who and a.at >= p_aw + 3600000 and a.site is null);
$$;

do $patch$
declare s text := pg_get_functiondef('private.clock_tick'::regproc); o text; n text;
begin
  -- 1) a flag per punch
  o := E'aw bigint;\nbegin';
  if position(o in s) = 0 then raise exception 'patch 1 not found'; end if;
  s := replace(s, o, E'aw bigint; unconf boolean := false;\nbegin');
  o := E'aw := public._num(p.data->>''away'');';
  if position(o in s) = 0 then raise exception 'patch 2 not found'; end if;
  s := replace(s, o, o || ' unconf := false;');
  -- 2) the "left" close waits for a confirming report
  o := E'    if aw is not null and aw > public._num(p.data->>''in'') and (nowms >= aw + 3600000 or p_now >= due) then\n      cl := aw; how := ''left'';\n';
  if position(o in s) = 0 then raise exception 'patch 3 not found'; end if;
  n := E'    if aw is not null and aw > public._num(p.data->>''in'') and (nowms >= aw + 3600000 or p_now >= due) then\n'
    || E'      -- Baruch 11/24: close only when a NEW report from 1 hour after he left shows him still away; a silent phone keeps it open\n'
    || E'      if not private.away_confirmed(p.data->>''who'', p.data->>''site'', aw) then\n'
    || E'        if p_now < due then\n'
    || E'          if nowms >= aw + 3600000 and coalesce(public._num(p.data->>''silentTold''), 0) <> aw then\n'
    || E'            sn := regexp_replace(coalesce((select data->>''name'' from records where coll = ''sites'' and id = p.data->>''site''), p.data->''newJob''->>''text'', ''the job''), '',?\\s*N[YJ]\\s*\\d{5}.*$'', '''');\n'
    || E'            lst := (select to_char(t.last_at at time zone ''America/New_York'',''HH12:MI AM'') from private.ot_tokens t where t.who = p.data->>''who'');\n'
    || E'            for x in select distinct q.v from (select jsonb_array_elements_text(to_ids) v union select ''u1'') q loop\n'
    || E'              perform private.notify_now(x,\n'
    || E'                ''📵 '' || coalesce((select data->>''name'' from records where coll = ''emps'' and id = p.data->>''who''), ''?'') || '' left '' || sn || '' at '' || to_char(to_timestamp(aw/1000.0) at time zone ''America/New_York'',''HH12:MI AM'')\n'
    || E'                  || coalesce('' — his phone''''s last report was at '' || lst, '' — his phone has not reported'') || ''. No report shows where he is now, so his clock stays open until his phone reports. Please check.'',\n'
    || E'                ''📵 '' || coalesce((select data->>''name'' from records where coll = ''emps'' and id = p.data->>''who''), ''?'') || '' salió de '' || sn || '' a las '' || to_char(to_timestamp(aw/1000.0) at time zone ''America/New_York'',''HH12:MI AM'')\n'
    || E'                  || coalesce('' — el último reporte de su teléfono fue a las '' || lst, '' — su teléfono no ha reportado'') || ''. Ningún reporte muestra dónde está, así que su reloj queda abierto hasta que su teléfono reporte. Por favor revise.'',\n'
    || E'                ''warn'', jsonb_build_object(''tab'',''hours''), null);\n'
    || E'            end loop;\n'
    || E'            update records set data = data || jsonb_build_object(''silentTold'', aw), updated_at = now(), updated_by = ''server'' where coll = ''punches'' and id = p.id;\n'
    || E'            n := n + 1;\n'
    || E'          end if;\n'
    || E'          continue;\n'
    || E'        end if;\n'
    || E'        unconf := true;   -- day close-out and still no report: close at the time he left, marked\n'
    || E'      end if;\n'
    || E'      cl := aw; how := ''left'';\n';
  s := replace(s, o, n);
  -- 3) mark it on the punch
  o := E'jsonb_build_object(''out'', cl, ''autoClosed'', jsonb_build_object(''at'', nowms, ''how'', how))';
  if position(o in s) = 0 then raise exception 'patch 4 not found'; end if;
  s := replace(s, o, E'jsonb_build_object(''out'', cl, ''autoClosed'', jsonb_build_object(''at'', nowms, ''how'', how) || case when unconf then ''{"unconfirmed":true}''::jsonb else ''{}''::jsonb end)');
  -- 4) the morning list says so
  o := E'when ''left'' then '' (left the job)''';
  if position(o in s) = 0 then raise exception 'patch 5 not found'; end if;
  s := replace(s, o, E'when ''left'' then case when r.data->''autoClosed''->>''unconfirmed'' = ''true'' then '' (left the job — phone went silent, never confirmed)'' else '' (left the job)'' end');
  execute s;
end $patch$;

-- Today page: the time of the newest GPS fix (GPS stuck = reports coming in with an old fix)
do $patch2$
declare s text := pg_get_functiondef('public.ot_report'::regproc); o text := E'''mode_at'', mode_at))';
begin
  if position(o in s) = 0 then raise exception 'ot_report patch not found'; end if;
  execute replace(s, o, E'''mode_at'', mode_at, ''fix'', last_tst))');
end $patch2$;
