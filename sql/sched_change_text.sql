-- Baruch 11/18: when a crew's day is changed (a job added / swapped in the Schedule), the push names the job and the time
-- ("Today: change — go to Islandtime Supermarket at 6:47 PM") instead of "schedule changed — open the app".
-- Patched into public.notify_assign right after the generic text is built; the generic text stays when nothing new was added.
do $$
declare d0 text; d2 text;
  anchor text := $a$                else 'el horario cambió — abre la app' end;$a$;
begin
  d0 := pg_get_functiondef('public.notify_assign()'::regprocedure);
  if position('chg:1118' in d0) > 0 then return; end if;
  if position(anchor in d0) = 0 then raise exception 'notify_assign: anchor not found'; end if;
  d2 := replace(d0, anchor, anchor || $b$
        -- chg:1118 name the new job(s) and time
        site := null; d := null;
        select string_agg(private.short_site(x.s) || case when coalesce(private.min_label(x.st),'') <> '' then ' at ' || private.min_label(x.st) else '' end, ' + '
                          order by case when x.st ~ '^[0-9.]+$' then x.st::numeric end nulls last),
               string_agg(private.short_site(x.s) || case when coalesce(private.min_label(x.st),'') <> '' then ' a las ' || private.min_label(x.st) else '' end, ' + '
                          order by case when x.st ~ '^[0-9.]+$' then x.st::numeric end nulls last)
          into site, d
          from (select a->>'site' s, a->>'start' st
                  from jsonb_array_elements(case when jsonb_typeof(n->'assignments') = 'array' then n->'assignments' else '[]'::jsonb end) a
                 where coalesce(a->>'site','') <> ''
                   and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(o->'assignments') = 'array' then o->'assignments' else '[]'::jsonb end) b
                                    where b->>'site' = a->>'site' and (b->>'start') is not distinct from (a->>'start'))
                union all
                select v->>'site', v->>'start'
                  from jsonb_each(case when jsonb_typeof(n->'replace') = 'object' then n->'replace' else '{}'::jsonb end) r(k2, v)
                 where coalesce(v->>'site','') <> '' and (o->'replace'->k2) is distinct from v) x
         where coalesce(private.short_site(x.s),'') <> '';
        if coalesce(site,'') <> '' and en like '%open the app' then   -- only where the old text said "open the app"
          en := private.day_label(day, 'en') || ': change — go to ' || site;
          es := private.day_label(day, 'es') || ': cambio — vayan a ' || d;
        end if;$b$);
  execute d2;
end $$;
