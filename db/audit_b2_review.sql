-- B2 (staging first): fixes from the independent offline / permissions review.
--  1. Private records: injury reports, one-to-one messages, job applications, invites and clock-fix requests are only
--     readable by the people involved and the office (they were readable by every team member). Files attached to
--     them follow automatically (file_ok uses the same rule).
--  2. Only the office and up can set a job's fixed travel pay (a worker could set it and log travel at that amount).
--  3. An edit from a phone that still had a record no longer brings back a record that was removed on another phone
--     (it came back with only the edited fields — e.g. a job with no address, text or people). Clock entries,
--     schedule days and garage items keep their own rules.

create or replace function public.can_see2(c text, d jsonb, me jsonb)
 returns boolean language sql stable set search_path to 'public' as $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c = 'emphr' then d->>'who' = me->>'id' or me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c in ('fixes','incidents') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'who' = me->>'id' or d->>'by' = me->>'id'
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id'
    when c in ('apps','invites') then me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false)
    else true end;
$function$;

do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.guard_record'::regproc);
  a := $x$or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip') then$x$;
  if position(a in d) = 0 then raise exception 'guard_record is not the expected version — not changed'; end if;
  d := replace(d, a, $x$or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip'
         or n->'travelPay' is distinct from o->'travelPay') then$x$);
  execute d;
end $do$;

do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.save_records'::regproc);
  a := $x$        v := coalesce(r->'patch', '{}'::jsonb);
        un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
        if ex then$x$;
  if position(a in d) = 0 then raise exception 'save_records is not the expected version — not changed'; end if;
  d := replace(d, a, $x$        v := coalesce(r->'patch', '{}'::jsonb);
        un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
        if ex and c not in ('punches','sched','stock')
           and exists (select 1 from public.records t where t.coll = c and t.id = i and t.deleted) then
          null;   -- B2: removed on another phone — an edit does not bring it back (the phone gets the removal)
        elsif ex then$x$);
  execute d;
end $do$;
