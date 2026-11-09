-- Baruch 11/9: Reports "All time" — the server adds up old hours (older than what the phone keeps) instead of
-- sending every punch to the phone. Runs as the caller, so everyone sees exactly the punches they could see before.
-- Fingercheck punches: added up per person, week (Sunday, New York) and job (hours = out - in, as the app counts them).
-- Punches from the app's own clock: sent as they are (the phone counts lunch etc. itself).
create or replace function public.labor_hist(p_from bigint, p_to bigint)
returns table(kind text, who text, wk text, site text, h float8, n int, rec jsonb)
language sql stable security invoker set search_path to 'public' as $f$
  with p as (
    select r.data d, public._num(r.data->>'in') tin, public._num(r.data->>'out') tout
    from public.records r
    where r.coll = 'punches' and not r.deleted
      and public._num(r.data->>'in') >= p_from and public._num(r.data->>'in') < p_to
      and coalesce(r.data->'rejected', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
      and coalesce(r.data->'pending', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb)
      and coalesce(r.data->'voided', 'null'::jsonb) in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb))
  select 'agg', d->>'who', to_char(dd - extract(dow from dd)::int, 'YYYY-MM-DD'), coalesce(nullif(d->>'site',''),'none'),
         sum(greatest(0, tout - tin) / 3600000.0)::float8, count(*)::int, null::jsonb
  from (select d, tin, tout, (to_timestamp(tin / 1000.0) at time zone 'America/New_York')::date dd from p
        where d->>'src' = 'fingercheck' and tout is not null) x
  group by 2, 3, 4
  union all
  select 'raw', null, null, null, null, null, d from p where coalesce(d->>'src','') <> 'fingercheck';
$f$;
revoke all on function public.labor_hist(bigint,bigint) from public, anon;
grant execute on function public.labor_hist(bigint,bigint) to authenticated;
