-- Baruch 11/21: office people (and the owner) are left out of the "Time to punch in" reminder and the 8:30 "not punched in yet"
-- list (Shia was on Friday's 8:30 list). Field workers and site managers are not changed. Patched into private.clock_tick.
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('office_out' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$and not done ? ('in:'||e.id)$a$,
                    $b$and not done ? ('in:'||e.id) and coalesce(e.data->>'role','') not in ('office','owner') /* office_out */$b$);
  d2 := replace(d2, $a$and (coalesce(r.data->>'crew','') = '' or private.man_sched_site(r.id, r.data->>'crew', d) is not null)$a$,
                    $b$and (coalesce(r.data->>'crew','') = '' or private.man_sched_site(r.id, r.data->>'crew', d) is not null) and coalesce(r.data->>'role','') not in ('office','owner')$b$);
  if (length(d2) - length(replace(d2, $c$not in ('office','owner')$c$, ''))) / length($c$not in ('office','owner')$c$) <> 2 then raise exception 'clock_tick anchors not found'; end if;
  execute d2;
end $$;
