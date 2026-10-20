-- B1b (staging first): the stock history row keeps where put-back material came from (supplier / invoice text, max 200).
do $do$ declare d text; a text; begin
  d := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  a := $x$'reason', rsn) - case when rsn is null then array['reason'] else array[]::text[] end,$x$;
  if position(a in d) = 0 then raise exception 'apply_stock_txn is not the expected version — not changed'; end if;
  d := replace(d, a, $x$'reason', rsn, 'src', nullif(left(trim(coalesce(txn->>'src','')), 200), ''))
      - case when rsn is null then array['reason'] else array[]::text[] end
      - case when nullif(trim(coalesce(txn->>'src','')), '') is null then array['src'] else array[]::text[] end,$x$);
  execute d;
end $do$;
