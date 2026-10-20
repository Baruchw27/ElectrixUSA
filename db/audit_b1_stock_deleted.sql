-- B1 (staging first): a put-back or a count of an item that was removed from the garage list brings the item back
-- (before: the move was recorded in the history but the item stayed removed, so the count looked like 0).
-- A pick-up of a removed item is still refused ("not enough in the garage"). Edits the current apply_stock_txn in place.
do $do$ declare d text; a1 text; a2 text; begin
  d := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  a1 := $x$values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0), false, actor, now())
        on conflict (coll,id) do nothing;$x$;
  a2 := $x$on conflict (coll,id) do update set data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now();$x$;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then raise exception 'apply_stock_txn is not the expected version — not changed'; end if;
  d := replace(d, a1, $x$values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0), false, actor, now())
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', 0), updated_by = actor, updated_at = now()
          where public.records.deleted;   -- B1: an item removed from the list comes back when it is put back$x$);
  d := replace(d, a2, $x$on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now();$x$);
  execute d;
end $do$;
