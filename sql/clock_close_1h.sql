-- Baruch 11/17: a forgotten app punch closes 1 hour after the day's end (8 PM; Friday 2:15 PM) — not 2 hours — at the last
-- time the app saw him on the job (else at the day's end). A crew kept late with "Stay late" is not closed then; theirs
-- waits until midnight (still at the last time seen on the job) in case they forget.
do $$
declare d text; old text := $a$due := (pend + interval '2 hours') at time zone 'America/New_York';$a$;
begin
  d := pg_get_functiondef('private.clock_tick(timestamptz)'::regprocedure);
  if position('kept_late(p.data' in d) > 0 then return; end if;
  if position(old in d) = 0 then raise exception 'clock_tick: 2-hour close not found'; end if;
  execute replace(d, old, $b$due := (pend + case when private.kept_late(p.data->>'who', to_char(pin,'YYYY-MM-DD')) then interval '5 hours' else interval '1 hour' end) at time zone 'America/New_York';  /* Baruch 11/17: 1 h, Stay late → midnight */$b$);
end $$;
