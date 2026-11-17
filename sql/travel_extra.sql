-- Baruch 11/16: travel pays 3.5 extra seconds for every minute of drive time, from Sunday Nov 15 2026 on
-- (last week and earlier stay exactly as they were). 38 min drive → paid as 40 min 13 s.
-- oneWay stays the plain drive time; minutes = paid minutes; pay = rate × paid minutes.
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('private.travel_leg(text,text,text,text,boolean)'::regprocedure);
  if position('extraSec' in d) > 0 then return; end if;
  d2 := replace(d,
    $q$'miles', round(mi, 1)::float8, 'oneWay', one::float8, 'minutes', one::float8,
         'pay', case when rate is null then null else round(rate * one / 60, 2)::float8 end,$q$,
    $q$'miles', round(mi, 1)::float8, 'oneWay', one::float8,
         'minutes', round(one * (60 + case when p_date >= '2026-11-15' then 3.5 else 0 end) / 60, 2)::float8,
         'extraSec', case when p_date >= '2026-11-15' then 3.5 else 0 end,
         'pay', case when rate is null then null else round(rate * one * (60 + case when p_date >= '2026-11-15' then 3.5 else 0 end) / 3600, 2)::float8 end,$q$);
  if d2 = d then raise exception 'travel_leg: pay line not found'; end if;
  execute d2;
end $$;
