-- 11/14 (Baruch, speed): looking at past weeks of hours was slow (1–2 s, up to 8 s) because the read rule was checked
-- on every punch ever (11,000+) BEFORE the dates were picked. Now the dates are picked first (using the index), then the
-- very same read rule is applied to just those rows. Who-sees-what is unchanged: is_member() + can_see2(), exactly as the
-- table's "team can read" policy.
create or replace function public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text default null::text, p_site text default null::text, p_limit integer default 3000)
 returns table(coll text, id text, data jsonb, deleted boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with c as materialized (
    select r.coll, r.id, r.data, r.deleted
      from public.records r
     where p_coll = 'punches' and r.coll = 'punches' and not r.deleted
       and public._num(r.data->>'in') >= p_from and public._num(r.data->>'in') < p_to
       and (p_who is null or r.data->>'who' = p_who)
       and (p_site is null or r.data->>'site' = p_site)
    union all
    select r.coll, r.id, r.data, r.deleted
      from public.records r
     where p_coll = 'travel' and r.coll = 'travel' and not r.deleted
       and (r.data->>'date') >= to_char(to_timestamp(p_from / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD')
       and (r.data->>'date') <  to_char(to_timestamp(p_to / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD')
       and (p_who is null or r.data->>'who' = p_who)
       and (p_site is null or r.data->>'site' = p_site)
  )
  select c.coll, c.id, c.data, c.deleted
    from c
   where (select public.is_member())
     and coalesce(public.can_see2(c.coll, c.data, (select public.my_emp_data())), false)
   order by c.id
   limit least(greatest(coalesce(p_limit, 3000), 1), 5000);
$function$;
