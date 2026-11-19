-- Baruch 11/19 (bug 5): a clock-in waiting for approval (pending) never closed by itself — forgotten, it stayed open for days.
-- It now closes by the same rules as any app punch (left the job / end of day / Stay late). It stays "waiting for approval".
do $$ declare d0 text; d2 text; begin
  d0 := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('close_pending' in d0) > 0 then return; end if;
  d2 := replace(d0, $a$and r.data->>'voided' is null and not coalesce(r.data->'pending' = 'true'::jsonb, false)$a$,
                    $b$and r.data->>'voided' is null and coalesce(r.data->>'rejected','') <> 'true'   /* close_pending 11/19: waiting-for-approval clock-ins close too */$b$);
  if d2 = d0 then raise exception 'clock_tick pending anchor not found'; end if;
  execute d2;
end $$;
