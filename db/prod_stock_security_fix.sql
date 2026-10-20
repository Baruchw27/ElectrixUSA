-- LIVE database, security-only fix for stock counts (prepared 2026-10-20; NOT applied until Baruch approves).
-- Changes nothing in the app and no data. Two things only:
--   1. A stock count can only change through the stock system (apply_stock_txn). Any other write that tries to change
--      `qty` keeps the stored count; a new item always starts at 0. (Today any signed-in worker can set any count
--      directly through the database API.)
--   2. apply_stock_txn checks every move: a pick-up only takes out, a return only brings in, a count only sets, every
--      amount is a number. (Today a "pick-up" of +50 adds 50, a "count" sent as plain amounts skips the office-only
--      rule, and a move with no amount blanks the count.)
-- Runs in one transaction; refuses to run if the function text is not the version it was tested against.

begin;

create or replace function public.guard_stock_qty() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;          -- server jobs / owner tools
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if; -- the stock system itself
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $$;

create or replace trigger records_guard_stock_qty before insert or update on public.records
  for each row when (new.coll = 'stock') execute function public.guard_stock_qty();

create schema if not exists private;
create table if not exists private.fn_backup(name text, def text, saved_at timestamptz default now());
revoke all on private.fn_backup from public, anon, authenticated;

do $patch$
declare src text; a text; b text;
begin
  src := pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure);
  if md5(src) <> '36d8402e664bd029acf5482fe98f40ae' and position('-- SEC moves' in src) = 0 then
    raise exception 'apply_stock_txn is not the version this fix was tested against (md5 %)', md5(src); end if;
  if position('-- SEC moves' in src) = 0 then
    a := $x$  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
$x$;
    b := $y$  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode = '22023'; end if;
  for m in select * from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) loop
    -- SEC moves: a pick-up only takes out, a return only brings in, a count only sets; amounts must be numbers
    if coalesce(jsonb_typeof(m),'') <> 'object' or coalesce(m->>'id','') = '' then raise exception 'bad move' using errcode = '22023'; end if;
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'set' and (coalesce(jsonb_typeof(m->'set'),'') <> 'number' or (m ? 'expect' and coalesce(jsonb_typeof(m->'expect'),'') <> 'number')) then raise exception 'count must be a number' using errcode = '22023'; end if;
    if kind <> 'set' and coalesce(jsonb_typeof(m->'delta'),'') <> 'number' then raise exception 'amount must be a number' using errcode = '22023'; end if;
    if kind = 'out' and (m->>'delta')::numeric >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and (m->>'delta')::numeric <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor not found exactly once'; end if;
    src := replace(src, a, b);
    -- switch the stock system's pass back off as soon as its own writes are done (today it stays on to the end of the
    -- request; harmless now because each request is its own transaction, but no reason to rely on that)
    a := $x$    on conflict (coll,id) do nothing;

  select coalesce$x$;
    b := $y$    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce$y$;
    if (length(src) - length(replace(src, a, ''))) / length(a) <> 1 then raise exception 'anchor 2 not found exactly once'; end if;
    insert into private.fn_backup(name, def) values ('apply_stock_txn', pg_get_functiondef('public.apply_stock_txn(jsonb)'::regprocedure));   -- exact copy of today's version, for rollback
    execute replace(src, a, b);
  end if;
end $patch$;

commit;

-- ROLLBACK (only if needed; restores today's behavior exactly):
--   alter table public.records disable trigger records_guard_stock_qty;
--   do $r$ begin execute (select def from private.fn_backup where name='apply_stock_txn' order by saved_at desc limit 1); end $r$;
