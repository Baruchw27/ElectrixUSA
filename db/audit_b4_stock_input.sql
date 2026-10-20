-- B4 (staging first): keep production's input checks on stock moves (found by the release diff — production's
-- security fix rejects malformed moves; staging's newer function only checked the sign). Every move must be an object
-- with an id, and counts / amounts must be numbers ("NaN", text or empty are refused).
do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  a := $x$    -- A2 signs: a pick-up only takes out, a return only brings in, a count only sets$x$;
  if position(a in d) = 0 then raise exception 'apply_stock_txn is not the expected version — not changed'; end if;
  if position('count must be a number' in d) > 0 then return; end if;   -- already there
  d := replace(d, a, $x$    -- B4 input checks (as in production's security fix)
    if jsonb_typeof(m) <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (m ? 'set' and public._num(m->>'set') is null) or (m ? 'expect' and public._num(m->>'expect') is null) then
      raise exception 'count must be a number' using errcode = '22023'; end if;
    if (m ? 'delta') and public._num(m->>'delta') is null then raise exception 'amount must be a number' using errcode = '22023'; end if;
$x$ || a);
  execute d;
end $do$;
