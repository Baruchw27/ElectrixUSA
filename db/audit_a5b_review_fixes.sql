-- A5b (STAGING) — fixes from the independent review of A5.
-- 1. A phone re-sending a whole clock entry (e.g. after a lost answer) may not carry fields the server or Payroll
--    added (pending / approvedBy / rejected / rejectWhy). Those are kept instead of the change being refused — the
--    refusal used to throw away the worker's later clock-out and breaks.
-- 2. Only Owner/Payroll may close someone else's open clock entry (managers keep only the "not approved" answer to
--    a "clock me in" request, which ends it at its own start).
-- 3. Removing an already-removed entry keeps its data.
do $p$ declare src text; a text; b text;
begin
  src := pg_get_functiondef('public.guard_record()'::regprocedure);
  if position('-- A5b keep' in src) = 0 then
    a := $x$  if role = 'owner' then return new; end if;
$x$;
    b := $y$  -- A5b keep: fields set by the server or by Payroll survive a phone re-sending an older whole copy
  if new.coll = 'punches' and tg_op = 'UPDATE' and jsonb_typeof(o) = 'object' and jsonb_typeof(n) = 'object'
     and not (role = 'owner' or (role = 'office' and me->>'title' = 'Payroll')) then
    n := n || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['pending','approvedBy','rejected','rejectWhy']) k where o ? k and not n ? k), '{}'::jsonb);
    new.data := n;
  end if;
  if role = 'owner' then return new; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor guard_record'; end if;
    execute replace(src, a, b);
  end if;
  src := pg_get_functiondef('public.guard_punch()'::regprocedure);
  if position('-- A5b close' in src) = 0 then
    a := $x$    if tg_op = 'UPDATE' and old.deleted then return new; end if;
$x$;
    b := $y$    if tg_op = 'UPDATE' and old.deleted then new.data := old.data; return new; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor 1'; end if;
    src := replace(src, a, b);
    a := $x$  -- an existing clock entry is being changed
$x$;
    if position(a in src) = 0 then a := $x$  if not private.edits_prefix_kept(o->'edits', n->'edits') then
$x$; end if;
    b := $y$  -- A5b close: only Owner/Payroll end someone else's open clock entry (a manager's "not approved" answer to a
  -- "clock me in" request ends it at its own start and is the one exception)
  if coalesce(o->'out','null'::jsonb) = 'null'::jsonb and coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
     and o->>'who' is distinct from me->>'id' and not clockok
     and not (coalesce(o->'pending' = 'true'::jsonb, false) and n->'out' = n->'in') then
    raise exception 'only the owner or Payroll can clock someone else out' using errcode = '42501'; end if;
$y$ || a;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor 2'; end if;
    execute replace(src, a, b);
  end if;
end $p$;
