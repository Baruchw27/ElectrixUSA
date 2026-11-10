-- Baruch 11/9 (2): the first version answered row by row and the server sends at most 1,000 rows per answer, so 'All time'
-- showed only part of the old hours. This one answers in ONE row: {agg:[[who,week,job,milliseconds],...], raw:[app punches]}.
create or replace function public.labor_hist2(p_from bigint, p_to bigint)
returns jsonb language sql stable security invoker set search_path to 'public' as $f$
  with p as (
    select r.data d, public._num(r.data->>'in') tin, public._num(r.data->>'out') tout
    from public.records r
    where r.coll = 'punches' and not r.deleted
      and public._num(r.data->>'in') >= p_from and public._num(r.data->>'in') < p_to
      and coalesce(r.data->'rejected', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
      and coalesce(r.data->'pending', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
      and coalesce(r.data->'voided', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)),
  a as (
    select d->>'who' who, to_char(dd - extract(dow from dd)::int, 'YYYY-MM-DD') wk, coalesce(nullif(d->>'site',''),'none') site,
           sum(greatest(0, tout - tin))::bigint ms
    from (select d, tin, tout, (to_timestamp(tin / 1000.0) at time zone 'America/New_York')::date dd from p
          where d->>'src' = 'fingercheck' and tout is not null) x
    group by 1, 2, 3)
  select jsonb_build_object(
    'agg', coalesce((select jsonb_agg(jsonb_build_array(who, wk, site, ms)) from a), '[]'::jsonb),
    'raw', coalesce((select jsonb_agg(d) from p where coalesce(d->>'src','') <> 'fingercheck'), '[]'::jsonb));
$f$;
revoke all on function public.labor_hist2(bigint,bigint) from public, anon;
grant execute on function public.labor_hist2(bigint,bigint) to authenticated;
