-- Baruch 11/24 (Luis Guillen): his clock closed because he LEFT a job; his phone then showed him at another job of ours.
-- "Yes, I think we should do that. The only difference is between jobs that's on their schedule and not … a job that's in his
-- schedule doesn't need a second report." The tracker (owntracks arrived(), after 5 minutes = 2 reports) now calls
-- public.ot_switch → private.app_switch for a closed clock too (before: only a "punch in" reminder). A job on his schedule is
-- started on the first report by pend_sweep (already live 11/23). app_switch's messages no longer say "(on his schedule)" when
-- the job is not on it.
do $patch$
declare s text := pg_get_functiondef('private.app_switch'::regproc); o text;
begin
  o := E'hm_lv text; hm_out text; aw bigint;';
  if position(o in s) = 0 then raise exception 'decl not found'; end if;
  s := replace(s, o, o || ' sch text; schs text;');
  o := E'  crew := (select data->>''crew'' from records where coll=''emps'' and id = p_who);';
  if position(o in s) = 0 then raise exception 'crew line not found'; end if;
  s := replace(s, o, o || E'\n  sch := case when private.on_sched(p_who, p_site, d) then '' (on his schedule)'' else '''' end;'
                       || E'\n  schs := case when sch <> '''' then '' (en su horario)'' else '''' end;');
  o := E'''his phone saw him at '' || sn || '' (on his schedule)'')';
  if position(o in s) = 0 then raise exception 'why 1 not found'; end if;
  s := replace(s, o, E'''his phone saw him at '' || sn || sch)');
  o := E'''his phone saw him at '' || sn || '' (on his schedule) after his clock closed at the other job''';
  if position(o in s) = 0 then raise exception 'why 2 not found'; end if;
  s := replace(s, o, E'''his phone saw him at '' || sn || sch || '' after his clock closed at the other job''');
  o := E''' is at '' || sn || '' (on his schedule) since ''';
  if position(o in s) = 0 then raise exception 'payroll en not found'; end if;
  s := replace(s, o, E''' is at '' || sn || sch || '' since ''');
  o := E''' está en '' || sn || '' (en su horario) desde las ''';
  if position(o in s) = 0 then raise exception 'payroll es not found'; end if;
  s := replace(s, o, E''' está en '' || sn || schs || '' desde las ''');
  execute s;
end $patch$;

create or replace function public.ot_switch(p_who text, p_site text, p_at bigint) returns text
language sql security definer set search_path to 'public', 'private' as $$
  select coalesce(private.app_switch(p_who, p_site, p_at), '');
$$;
revoke all on function public.ot_switch(text, text, bigint) from public, anon, authenticated;
grant execute on function public.ot_switch(text, text, bigint) to service_role;
