-- 10_forward.sql  --  Electrix USA release: bring PRODUCTION (lnbcrptcdufnmqsvsisv) database objects to STAGING (rkkxykdkjgdsgkujanau)
-- Generated 2026-10-20 from read-only catalog queries. NOT APPLIED. Review DIFF_REPORT.md first (production has stock-move
-- validation in apply_stock_txn that staging's version removes).
-- One transaction, idempotent (safe to run twice). Function bodies are byte-exact copies of staging pg_get_functiondef (md5-verified).
-- Deliberately NOT included: staging-only test objects (public.scan_field_log + its seq/index/policies, public.zz_bc_* tables),
-- cron jobs daily-backup (already on production, identical) and backup-health (see 20_backups_optional.sql).
-- Production-only objects are left untouched (cron trello_sync_5min, tables _hr_migrate_log, backup_records_s1/s2_20261018,
-- sites_bak_20261019, private.fn_backup).

begin;
set local search_path = public, extensions;

-- ===== 1. schema drill (target of public.backup_restore(p_target => 'drill')) =====
create schema if not exists drill;

-- ===== 2. sequences (staging-only) =====
create sequence if not exists private.notify_queue_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;
create sequence if not exists private.client_errors_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

-- ===== 3. tables (staging-only) =====
create table if not exists private.notify_queue (
  id bigint not null default nextval('private.notify_queue_id_seq'::regclass),
  to_id text not null,
  qkey text not null,
  actor text,
  en text not null,
  es text not null,
  sig_before text,
  sig_after text,
  link jsonb,
  created timestamp with time zone not null default now(),
  sent timestamp with time zone,
  constraint notify_queue_pkey primary key (id)
);
create table if not exists private.client_errors (
  id bigint not null default nextval('private.client_errors_id_seq'::regclass),
  at timestamp with time zone not null default now(),
  who text,
  ver text,
  ua text,
  kind text not null,
  msg text not null,
  src text,
  n integer not null default 1,
  constraint client_errors_pkey primary key (id)
);
create table if not exists public.ai_usage (
  day date not null default CURRENT_DATE,
  uid uuid not null,
  kind text not null,
  n integer not null default 0,
  constraint ai_usage_pkey primary key (day, uid, kind)
);
create table if not exists drill.records (
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_by text,
  updated_at timestamp with time zone not null default now(),
  constraint records_pkey primary key (coll, id)
);
alter sequence private.notify_queue_id_seq owned by private.notify_queue.id;
alter sequence private.client_errors_id_seq owned by private.client_errors.id;
-- (no columns missing on tables that exist on both sides: records, records_backup, records_history, server_config, stock_applied, upc_cache match)

-- ===== 4. indexes (staging-only; pg_get_indexdef + IF NOT EXISTS) =====
CREATE INDEX IF NOT EXISTS notify_queue_open ON private.notify_queue USING btree (created) WHERE (sent IS NULL);
CREATE INDEX IF NOT EXISTS client_errors_at ON private.client_errors USING btree (at);
CREATE INDEX IF NOT EXISTS records_punch_in_idx ON public.records USING btree (_num((data ->> 'in'::text))) WHERE (coll = 'punches'::text);
CREATE INDEX IF NOT EXISTS records_coll_idx ON drill.records USING btree (coll);
CREATE INDEX IF NOT EXISTS records_expr_idx ON drill.records USING btree (((data ->> 'authUid'::text))) WHERE (coll = 'emps'::text);
CREATE INDEX IF NOT EXISTS records_updated_at_idx ON drill.records USING btree (updated_at);
CREATE INDEX IF NOT EXISTS records__num_idx ON drill.records USING btree (_num((data ->> 'in'::text))) WHERE (coll = 'punches'::text);

-- ===== 5. table privileges / RLS as on staging =====
alter table public.ai_usage enable row level security;   -- staging: RLS on, no policies (only ai_take / service_role touch it)
revoke all on table public.ai_usage from public, anon, authenticated;
grant all on table public.ai_usage to service_role;
revoke all on table private.notify_queue from public, anon, authenticated, service_role;   -- staging ACL: owner (postgres) only
revoke all on table private.client_errors from public, anon, authenticated, service_role;   -- staging ACL: owner (postgres) only
revoke all on table drill.records from public, anon, authenticated, service_role;   -- staging ACL: owner (postgres) only

-- ===== 6. functions: staging pg_get_functiondef, byte-exact; private helpers -> public functions -> trigger functions =====

-- ----- 6a. private helpers -----

-- private.arr_len  [new (staging-only)]  staging md5 7b5c86192b14f4ead31825008619e593
CREATE OR REPLACE FUNCTION private.arr_len(a jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case when jsonb_typeof(a) = 'array' then jsonb_array_length(a) else 0 end;
$function$
;
revoke all on function private.arr_len(a jsonb) from public, anon, authenticated, service_role;
grant execute on function private.arr_len(a jsonb) to authenticated;

-- private.crew_name  [new (staging-only)]  staging md5 697c54083dfda8dd32d98bce1712f48d
CREATE OR REPLACE FUNCTION private.crew_name(p_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select data->>'name' from public.records where coll = 'crews' and id = p_id and not deleted limit 1), '') $function$
;
-- private.crew_name(p_id text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.day_label  [new (staging-only)]  staging md5 65f3d0ec9884f978389142cbea2c234f
CREATE OR REPLACE FUNCTION private.day_label(d date, l text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when l = 'es'
    then (array['dom','lun','mar','mié','jue','vie','sáb'])[extract(dow from d)::int + 1] || ' ' || extract(day from d)::int || ' '
         || (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from d)::int]
    else to_char(d, 'Dy Mon FMDD') end $function$
;
-- private.day_label(d date, l text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.edits_prefix_kept  [new (staging-only)]  staging md5 70903d004551a638b570919c990a1063
CREATE OR REPLACE FUNCTION private.edits_prefix_kept(o jsonb, n jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
begin
  if coalesce(jsonb_typeof(o),'') <> 'array' then return true; end if;
  if jsonb_array_length(o) = 0 then return true; end if;
  if coalesce(jsonb_typeof(n),'') <> 'array' then return false; end if;
  if jsonb_array_length(n) < jsonb_array_length(o) then return false; end if;
  return (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(n) with ordinality x(e, i) where i <= jsonb_array_length(o)) = o;
end $function$
;
revoke all on function private.edits_prefix_kept(o jsonb, n jsonb) from public, anon, authenticated, service_role;
grant execute on function private.edits_prefix_kept(o jsonb, n jsonb) to authenticated;

-- private.emp_row  [new (staging-only)]  staging md5 edb053a111930d6c32302e4c7701882f
CREATE OR REPLACE FUNCTION private.emp_row(p_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select data from public.records where coll = 'emps' and id = p_id and not deleted limit 1 $function$
;
-- private.emp_row(p_id text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.expand_people  [new (staging-only)]  staging md5 e3548691f8e86ef48a4361fb10d4ab25
CREATE OR REPLACE FUNCTION private.expand_people(p jsonb)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with ids as (select jsonb_array_elements_text(case jsonb_typeof(p) when 'array' then p when 'string' then jsonb_build_array(p) else '[]'::jsonb end) x)
  select distinct e.id from public.records e join ids on (e.id = ids.x or e.data->>'crew' = ids.x)
   where e.coll = 'emps' and not e.deleted and not coalesce((e.data->>'inactive')::boolean, false) $function$
;
-- private.expand_people(p jsonb): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.last_why  [new (staging-only)]  staging md5 22de8a8499c4a68b7f49a99bd1967174
CREATE OR REPLACE FUNCTION private.last_why(n jsonb, min_len integer DEFAULT 3)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare w text;
begin
  if coalesce(jsonb_typeof(n->'edits'),'') <> 'array' then return null; end if;
  if jsonb_array_length(n->'edits') = 0 then return null; end if;
  w := trim(coalesce(n->'edits'->-1->>'why',''));
  return case when length(w) >= min_len then w end;
end $function$
;
revoke all on function private.last_why(n jsonb, min_len integer) from public, anon, authenticated, service_role;
grant execute on function private.last_why(n jsonb, min_len integer) to authenticated;

-- private.min_label  [new (staging-only)]  staging md5 f5b25597b8d63942bb3a4ef8f948675f
CREATE OR REPLACE FUNCTION private.min_label(m text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when m ~ '^[0-9]+$' then to_char(time '00:00' + (m::int % 1440) * interval '1 minute', 'FMHH12:MI AM') else coalesce(m, '') end $function$
;
-- private.min_label(m text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.short_site  [new (staging-only)]  staging md5 d6dcce1aa7a70f7eaaa03b8c8346726f
CREATE OR REPLACE FUNCTION private.short_site(p_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(split_part((select data->>'name' from public.records where coll = 'sites' and id = p_id and not deleted limit 1), ',', 1), '') $function$
;
-- private.short_site(p_id text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.sched_sig  [new (staging-only)]  staging md5 e35f981a11033f4cd8362d9cd0ff636f
CREATE OR REPLACE FUNCTION private.sched_sig(d jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when d is null or jsonb_typeof(d) <> 'object' or d = '{}'::jsonb then ''
    else coalesce((select string_agg(coalesce(a->>'site','') || '@' || coalesce(a->>'start','') || '-' || coalesce(a->>'end',''), ',' order by (a->>'start'), a->>'site')
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''), coalesce(d->>'site','') || '@' || coalesce(d->>'time',''))
         || '|' || coalesce(d->>'cancel','') || '|' || coalesce(d->>'replace','')
         || '|' || coalesce(d->>'from','') || '|' || coalesce(d->>'to','') || '|' || coalesce(d->>'start','') || '|' || coalesce(d->>'end','')
         || '|' || coalesce(d->>'workdays','') end $function$
;
-- private.sched_sig(d jsonb): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.sched_text  [new (staging-only)]  staging md5 597c0ff801719d641f2933ac50e613a0
CREATE OR REPLACE FUNCTION private.sched_text(d jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select string_agg(nullif(private.short_site(a->>'site'), '') || ' ' || private.min_label(a->>'start'), ' + ' order by case when a->>'start' ~ '^[0-9.]+$' then (a->>'start')::numeric end nulls last)
                     from jsonb_array_elements(case when jsonb_typeof(d->'assignments') = 'array' then d->'assignments' else '[]'::jsonb end) a
                    where coalesce(a->>'site','') <> ''),
                  nullif(private.short_site(d->>'site') || case when coalesce(d->>'time','') <> '' then ' ' || (d->>'time') else '' end, ''), '') $function$
;
-- private.sched_text(d jsonb): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.punch_breaks_kept  [new (staging-only)]  staging md5 e273c2ac0814a9bc49affe7c4cf1ccb5
CREATE OR REPLACE FUNCTION private.punch_breaks_kept(o jsonb, n jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select
    (case when jsonb_typeof(o->'breaks') = 'array' then o->'breaks' else '[]'::jsonb end)
      <@ (case when jsonb_typeof(n->'breaks') = 'array' then n->'breaks' else '[]'::jsonb end)
    and (case when jsonb_typeof(o->'trips') = 'array' then o->'trips' else '[]'::jsonb end)
      <@ (case when jsonb_typeof(n->'trips') = 'array' then n->'trips' else '[]'::jsonb end)
    and (coalesce(o->'breakStart','null'::jsonb) = 'null'::jsonb
         or n->'breakStart' = o->'breakStart'
         or (jsonb_typeof(n->'breaks') = 'array' and n->'breaks' @> jsonb_build_array(jsonb_build_object('s', o->'breakStart'))))
    and (coalesce(o->'away','null'::jsonb) = 'null'::jsonb
         or n->'away' = o->'away'
         or coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
         or (jsonb_typeof(n->'trips') = 'array' and n->'trips' @> jsonb_build_array(jsonb_build_object('left', o->'away'))));
$function$
;
revoke all on function private.punch_breaks_kept(o jsonb, n jsonb) from public, anon, authenticated, service_role;
grant execute on function private.punch_breaks_kept(o jsonb, n jsonb) to authenticated;

-- private.travel_checked  [new (staging-only)]  staging md5 72c7d74496d13a9f2ffe0aef23d9b342
CREATE OR REPLACE FUNCTION private.travel_checked(n jsonb, rid text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s jsonb; d date; mins numeric; pay numeric; rate numeric; tmin numeric;
        today date := (now() at time zone 'America/New_York')::date;
begin
  begin d := (n->>'date')::date; exception when others then d := null; end;
  if d is null or coalesce(n->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or d < today - 3 or d > today + 1 then
    raise exception 'travel date out of range' using errcode = '42501'; end if;
  if exists (select 1 from public.records x where x.coll = 'travel' and not x.deleted and x.id <> rid
              and x.data->>'who' = n->>'who' and x.data->>'site' = n->>'site' and x.data->>'date' = n->>'date') then
    raise exception 'travel already logged for this job that day' using errcode = '42501'; end if;
  select r.data into s from public.records r where r.coll = 'sites' and r.id = n->>'site' and not r.deleted;
  if s is null or jsonb_typeof(s) <> 'object' then raise exception 'unknown job' using errcode = '42501'; end if;
  if jsonb_typeof(s->'trip') = 'object' and public._num(s->'trip'->>'min') is not null then
    mins := round(public._num(s->'trip'->>'min'));
  else
    mins := least(greatest(coalesce(public._num(n->>'minutes'), 0), 0), 240);
  end if;
  if coalesce(s->>'travelPay','') <> '' and public._num(s->>'travelPay') is not null then
    pay := public._num(s->>'travelPay');
  else
    tmin := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelMin' and not r.deleted), 25);
    if mins <= tmin then raise exception 'local job: no travel pay' using errcode = '42501'; end if;
    rate := coalesce((select coalesce(public._num(r.data->>'v'), public._num(r.data #>> '{}')) from public.records r where r.coll = '_' and r.id = 'travelRate' and not r.deleted), 0);
    pay := round(rate * mins / 60, 2);
  end if;
  return n || jsonb_build_object('minutes', mins::float8, 'pay', pay::float8, 'auto', true, 'status', 'approved');   -- plain numbers, like the app writes
end $function$
;
revoke all on function private.travel_checked(n jsonb, rid text) from public, anon, authenticated, service_role;
grant execute on function private.travel_checked(n jsonb, rid text) to authenticated;

-- private.notify_now  [new (staging-only)]  staging md5 5f339e028bb1b2212714fdd7e9b08371
CREATE OR REPLACE FUNCTION private.notify_now(p_to text, p_en text, p_es text, p_kind text, p_link jsonb, p_actor text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e jsonb; nid text; msg text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if p_to is null or p_to = '' or p_to = coalesce(p_actor, '') then return; end if;
  e := private.emp_row(p_to);
  if e is null or coalesce((e->>'inactive')::boolean, false) then return; end if;
  msg := case when e->>'lang' = 'es' then p_es else p_en end;
  if msg is null or msg = '' then return; end if;
  if exists (select 1 from public.records where coll = 'inbox' and not deleted and data->>'to' = p_to and data->>'msg' = msg
              and updated_at > now() - interval '2 minutes') then return; end if;
  nid := 'n' || replace(gen_random_uuid()::text, '-', '');
  insert into public.records (coll, id, data, deleted, updated_by, updated_at)
  values ('inbox', nid, jsonb_build_object('id', nid, 'to', p_to, 'msg', msg, 'kind', coalesce(p_kind, 'info'), 'ts', nowms,
          'read', false, 'link', p_link, 'auto', true), false, 'server', now());
end $function$
;
-- private.notify_now(p_to text, p_en text, p_es text, p_kind text, p_link jsonb, p_actor text): staging proacl is NULL (default privileges) -> no grant statements emitted

-- private.tidy_client_errors  [new (staging-only)]  staging md5 658a69525f76f54797f23c211101440e
CREATE OR REPLACE FUNCTION private.tidy_client_errors()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  delete from private.client_errors where at < now() - interval '60 days' $function$
;
-- private.tidy_client_errors(): staging proacl is NULL (default privileges) -> no grant statements emitted

-- ----- 6b. public functions (non-trigger) -----

-- public.can_see2  [REPLACES production version]  staging md5 bb52dde12643dc2d42d29486317569c9
CREATE OR REPLACE FUNCTION public.can_see2(c text, d jsonb, me jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps','emphr','stockLog','rejq',
                   'incidents','msgs','apps','invites','fixes') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c = 'emphr' then d->>'who' = me->>'id' or me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean or d->>'who' = me->>'id'
    when c in ('fixes','incidents') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'who' = me->>'id' or d->>'by' = me->>'id'
    when c in ('stockLog','rejq') then
         me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false) or d->>'by' = me->>'id'
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper')) or d->>'who' = me->>'id'
    when c = 'msgs' then me->>'role' = 'owner' or d->>'from' = me->>'id' or d->>'to' = me->>'id'
    when c in ('apps','invites') then me->>'role' in ('owner','manager','office') or coalesce((me->>'all')::boolean,false)
    else true end;
$function$
;
revoke all on function public.can_see2(c text, d jsonb, me jsonb) from public, anon, authenticated, service_role;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to authenticated;
grant execute on function public.can_see2(c text, d jsonb, me jsonb) to service_role;

-- public.save_records  [REPLACES production version]  staging md5 4eb565356a50caa8c9b5e73eaf140b2f
CREATE OR REPLACE FUNCTION public.save_records(rows jsonb)
 RETURNS TABLE(coll text, id text, data jsonb, deleted boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare r jsonb; un text[]; ex boolean; c text; i text; del boolean; v jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    c := r->>'coll'; i := r->>'id'; del := coalesce((r->>'deleted')::boolean, false);
    begin
      ex := private.row_exists(c, i);
      if del or r ? 'full' then
        v := coalesce(r->'full', '{}'::jsonb);
        if ex then
          update public.records as t set data = v, deleted = del, updated_by = r->>'by', updated_at = now() where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, v, del, r->>'by', now());
        end if;
      else
        v := coalesce(r->'patch', '{}'::jsonb);
        un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
        if ex and c not in ('punches','sched','stock')
           and exists (select 1 from public.records t where t.coll = c and t.id = i and t.deleted) then
          null;   -- B2: removed on another phone — an edit does not bring it back (the phone gets the removal)
        elsif ex then
          update public.records as t
            set data = case when t.deleted then v
                            when jsonb_typeof(t.data) <> 'object' then t.data
                            else (t.data || v) - un end,
                deleted = false, updated_by = r->>'by', updated_at = now()
            where t.coll = c and t.id = i;
        else
          insert into public.records (coll, id, data, deleted, updated_by, updated_at) values (c, i, v, false, r->>'by', now());
        end if;
      end if;
    exception
      when insufficient_privilege then null;
      when unique_violation then
        update public.records as t set data = case when r ? 'full' or del then coalesce(r->'full','{}'::jsonb)
                                                    when jsonb_typeof(t.data) <> 'object' then t.data
                                                    else t.data || coalesce(r->'patch','{}'::jsonb) end,
               deleted = del, updated_by = r->>'by', updated_at = now()
          where t.coll = c and t.id = i;
    end;
    return query select t.coll, t.id, t.data, t.deleted from public.records t where t.coll = c and t.id = i;
  end loop;
end $function$
;
revoke all on function public.save_records(rows jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_records(rows jsonb) to authenticated;
grant execute on function public.save_records(rows jsonb) to service_role;

-- public.apply_stock_moves  [new (staging-only)]  staging md5 31d1b5735e1f5f4d69a6febd3daec083
CREATE OR REPLACE FUNCTION public.apply_stock_moves(moves jsonb)
 RETURNS TABLE(id text, qty numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare m jsonb;
begin
  for m in select * from jsonb_array_elements(moves) loop
    update public.records t
      set data = jsonb_set(t.data,'{qty}', to_jsonb(greatest(0, coalesce((t.data->>'qty')::numeric,0) + coalesce((m->>'delta')::numeric,0)))),
          updated_by = m->>'by', updated_at = now()
      where t.coll='stock' and t.id = m->>'id' and not t.deleted;
    return query select t.id, (t.data->>'qty')::numeric from public.records t where t.coll='stock' and t.id = m->>'id';
  end loop;
end $function$
;
revoke all on function public.apply_stock_moves(moves jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_stock_moves(moves jsonb) to public;
grant execute on function public.apply_stock_moves(moves jsonb) to anon;
grant execute on function public.apply_stock_moves(moves jsonb) to authenticated;
grant execute on function public.apply_stock_moves(moves jsonb) to service_role;

-- public.apply_stock_txn  [REPLACES production version]  staging md5 dad5618df00db4ddef4617307d16c89e
CREATE OR REPLACE FUNCTION public.apply_stock_txn(txn jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare txnid text; fp text; existing_fp text; m jsonb; me jsonb; actor text; can_adjust boolean;
        cur numeric; newq numeric; nm text; items jsonb := '[]'::jsonb; out_qtys jsonb; kind text; seqv bigint;
        rsn text;
begin
  txnid := txn->>'id';
  if coalesce(txnid,'') = '' then raise exception 'txn id required' using errcode='22023'; end if;
  me := public.my_emp_data(); actor := me->>'id';
  if coalesce(actor,'') = '' then raise exception 'not allowed' using errcode='42501'; end if;
  can_adjust := (me->>'role' in ('owner','manager','office')) or coalesce((me->>'all')::boolean,false);
  kind := coalesce(txn->>'kind','');
  if kind not in ('in','out','set') then raise exception 'bad kind' using errcode='22023'; end if;
  rsn := nullif(left(trim(coalesce(txn->>'reason','')), 300), '');
  fp := md5(kind || '|' || coalesce((txn->'moves')::text,'[]'));

  insert into public.stock_applied(id, fingerprint) values(txnid, fp) on conflict (id) do nothing;
  if not found then
    select fingerprint into existing_fp from public.stock_applied where id = txnid;
    if existing_fp is distinct from fp then
      raise exception 'txn_reuse_conflict: id % reused with different content', txnid using errcode='23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
      from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
      left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
    return jsonb_build_object('duplicate', true, 'qtys', out_qtys);
  end if;

  perform set_config('app.stock_txn','1', true);
  for m in select value from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) order by value->>'id' loop
    -- A2 signs: a pick-up only takes out, a return only brings in, a count only sets
    if (kind = 'set') <> (m ? 'set') then raise exception 'bad move for this kind of change' using errcode = '22023'; end if;
    if kind = 'out' and coalesce(public._num(m->>'delta'), 0) >= 0 then raise exception 'a pick-up must take items out' using errcode = '22023'; end if;
    if kind = 'in' and coalesce(public._num(m->>'delta'), 0) <= 0 then raise exception 'a return must bring items in' using errcode = '22023'; end if;
    if (m ? 'delta') and not (m ? 'set') and (m->>'delta')::numeric > 0 then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',0,'qv',0), false, actor, now())
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', 0), updated_by = actor, updated_at = now()
          where public.records.deleted;   -- B1: an item removed from the list comes back when it is put back
    end if;
    select (data->>'qty')::numeric, data->>'name' into cur, nm
      from public.records where coll='stock' and id = m->>'id' and not deleted for update;
    if m ? 'set' then
      if not can_adjust then raise exception 'manual stock adjustment is office/owner only' using errcode='42501'; end if;
      if (m ? 'expect') and coalesce(cur,0) <> (m->>'expect')::numeric then
        raise exception 'stock_changed_recount: % now %, you saw %', m->>'id', coalesce(cur,0), m->>'expect' using errcode='40001';
      end if;
      newq := greatest(0, (m->>'set')::numeric);
    else
      if (m->>'delta') is null then raise exception 'move needs delta or set' using errcode='22023'; end if;
      newq := coalesce(cur,0) + (m->>'delta')::numeric;
      if newq < 0 then
        raise exception 'insufficient_stock: % available %, requested %', coalesce(nm,m->>'name',m->>'id'), coalesce(cur,0), abs((m->>'delta')::numeric) using errcode='P0001';
      end if;
    end if;
    if cur is null then
      insert into public.records(coll,id,data,deleted,updated_by,updated_at)
        values('stock', m->>'id', jsonb_build_object('id',m->>'id','name',coalesce(m->>'name',m->>'id'),'unit',coalesce(m->>'unit','pc'),'min',0,'qty',newq,'qv',1), false, actor, now())
        on conflict (coll,id) do update set deleted = false, data = public.records.data || jsonb_build_object('qty', newq, 'qv', coalesce((public.records.data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now();
    else
      update public.records set data = data || jsonb_build_object('qty', newq, 'qv', coalesce((data->>'qv')::bigint,0)+1), updated_by=actor, updated_at=now()
        where coll='stock' and id = m->>'id';
    end if;
    items := items || jsonb_build_object('id', m->>'id', 'name', coalesce(nm,m->>'name',m->>'id'),
               'before', coalesce(cur,0), 'after', newq,
               'change', case when m ? 'set' then newq - coalesce(cur,0) else (m->>'delta')::numeric end);
  end loop;

  seqv := nextval('public.stock_seq');
  insert into public.records(coll,id,data,deleted,updated_by,updated_at)
    values('stockLog', txnid, jsonb_build_object(
      'kind', kind, 'by', actor, 'approvedBy', case when kind='set' then actor else null end,
      'site', txn->>'site', 'dir', case when kind='in' then 'from' else 'to' end,
      'items', items, 'ts', coalesce((txn->>'ts')::bigint, (extract(epoch from now())*1000)::bigint),
      'serverTs', (extract(epoch from now())*1000)::bigint, 'seq', seqv, 'applied', true, 'auth', true,
      'reason', rsn, 'src', nullif(left(trim(coalesce(txn->>'src','')), 200), ''))
      - case when rsn is null then array['reason'] else array[]::text[] end
      - case when nullif(trim(coalesce(txn->>'src','')), '') is null then array['src'] else array[]::text[] end,
      false, actor, now())
    on conflict (coll,id) do nothing;
  perform set_config('app.stock_txn','', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', ids.mid, 'qty', coalesce((r.data->>'qty')::numeric,0), 'qv', coalesce((r.data->>'qv')::bigint,0))), '[]'::jsonb) into out_qtys
    from (select distinct m2->>'id' as mid from jsonb_array_elements(coalesce(txn->'moves','[]'::jsonb)) m2) ids
    left join public.records r on r.coll='stock' and r.id = ids.mid and not r.deleted;
  return jsonb_build_object('duplicate', false, 'qtys', out_qtys);
end $function$
;
revoke all on function public.apply_stock_txn(txn jsonb) from public, anon, authenticated, service_role;
grant execute on function public.apply_stock_txn(txn jsonb) to public;
grant execute on function public.apply_stock_txn(txn jsonb) to anon;
grant execute on function public.apply_stock_txn(txn jsonb) to authenticated;
grant execute on function public.apply_stock_txn(txn jsonb) to service_role;

-- public.history_records  [new (staging-only)]  staging md5 81569f348f9bd75ff3aa3feb4ad13658
CREATE OR REPLACE FUNCTION public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text DEFAULT NULL::text, p_site text DEFAULT NULL::text, p_limit integer DEFAULT 3000)
 RETURNS TABLE(coll text, id text, data jsonb, deleted boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.coll, r.id, r.data, r.deleted
  from public.records r
  where p_coll in ('punches','travel')
    and r.coll = p_coll and not r.deleted
    and (p_who is null or r.data->>'who' = p_who)
    and (p_site is null or r.data->>'site' = p_site)
    and case when p_coll = 'punches' then public._num(r.data->>'in') >= p_from and public._num(r.data->>'in') < p_to
             else (r.data->>'date') >= to_char(to_timestamp(p_from / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD')
              and (r.data->>'date') <  to_char(to_timestamp(p_to / 1000.0) at time zone 'America/New_York', 'YYYY-MM-DD') end
  order by r.id
  limit least(greatest(coalesce(p_limit, 3000), 1), 5000);
$function$
;
revoke all on function public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text, p_site text, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text, p_site text, p_limit integer) to authenticated;
grant execute on function public.history_records(p_coll text, p_from bigint, p_to bigint, p_who text, p_site text, p_limit integer) to service_role;

-- public.stock_item_history  [new (staging-only)]  staging md5 ba9945af43029ba7e41b9855b1eae22c
CREATE OR REPLACE FUNCTION public.stock_item_history(p_id text)
 RETURNS TABLE(action_ts bigint, server_ts bigint, kind text, by_emp text, approved_by text, site text, dir text, before_qty numeric, after_qty numeric, change numeric)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select (l.data->>'ts')::bigint, (l.data->>'serverTs')::bigint, l.data->>'kind', l.data->>'by', l.data->>'approvedBy',
         l.data->>'site', l.data->>'dir', (it->>'before')::numeric, (it->>'after')::numeric, (it->>'change')::numeric
  from public.records l, lateral jsonb_array_elements(coalesce(l.data->'items','[]'::jsonb)) it
  where l.coll='stockLog' and not l.deleted and it->>'id' = p_id
  order by coalesce((l.data->>'seq')::bigint,0) desc, (l.data->>'serverTs')::bigint desc nulls last, l.updated_at desc;
$function$
;
revoke all on function public.stock_item_history(p_id text) from public, anon, authenticated, service_role;
grant execute on function public.stock_item_history(p_id text) to public;
grant execute on function public.stock_item_history(p_id text) to anon;
grant execute on function public.stock_item_history(p_id text) to authenticated;
grant execute on function public.stock_item_history(p_id text) to service_role;

-- public.stock_site_history  [new (staging-only)]  staging md5 779c2d207a41fc5da7abd0a627ab61bd
CREATE OR REPLACE FUNCTION public.stock_site_history(p_site text)
 RETURNS TABLE(action_ts bigint, server_ts bigint, kind text, by_emp text, item_id text, item_name text, change numeric)
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select (l.data->>'ts')::bigint, (l.data->>'serverTs')::bigint, l.data->>'kind', l.data->>'by',
         it->>'id', it->>'name', (it->>'change')::numeric
  from public.records l, lateral jsonb_array_elements(coalesce(l.data->'items','[]'::jsonb)) it
  where l.coll='stockLog' and not l.deleted and l.data->>'site' = p_site
  order by (l.data->>'serverTs')::bigint desc nulls last, l.updated_at desc;
$function$
;
revoke all on function public.stock_site_history(p_site text) from public, anon, authenticated, service_role;
grant execute on function public.stock_site_history(p_site text) to public;
grant execute on function public.stock_site_history(p_site text) to anon;
grant execute on function public.stock_site_history(p_site text) to authenticated;
grant execute on function public.stock_site_history(p_site text) to service_role;

-- public.ai_take  [new (staging-only)]  staging md5 da5b4654722bcbd7c1391ce6ee1c896f
CREATE OR REPLACE FUNCTION public.ai_take(p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare mine int; team int; month int; k text := coalesce(p_kind,'label');
begin
  if auth.uid() is null or not public.is_member() then return false; end if;
  if k = 'label' then
    perform pg_advisory_xact_lock(hashtext('ai_take'));             -- two phones at once can't both slip past a cap
    select coalesce(sum(n),0) into team from ai_usage where day = current_date and kind = 'label';
    select coalesce(sum(n),0) into mine from ai_usage where day = current_date and kind = 'label' and uid = auth.uid();
    select coalesce(sum(n),0) into month from ai_usage where day >= date_trunc('month', current_date)::date and kind = 'label';
    if mine >= 60 or team >= 400 or month >= 3000 then return false; end if;
  end if;
  insert into ai_usage(day, uid, kind, n) values (current_date, auth.uid(), k, 1)
    on conflict (day, uid, kind) do update set n = ai_usage.n + 1;
  return true;
end $function$
;
revoke all on function public.ai_take(p_kind text) from public, anon, authenticated, service_role;
grant execute on function public.ai_take(p_kind text) to authenticated;
grant execute on function public.ai_take(p_kind text) to service_role;

-- public.log_client_errors  [new (staging-only)]  staging md5 df06dd78617b35bfdc2a6da81020f86b
CREATE OR REPLACE FUNCTION public.log_client_errors(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me jsonb := public.my_emp_data(); r jsonb; k int := 0; used int;
begin
  if me = '{}'::jsonb or jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  select coalesce(sum(n),0) into used from private.client_errors where who = me->>'id' and at > now() - interval '1 day';
  if used >= 300 then return 0; end if;
  for r in select value from jsonb_array_elements(p_rows) limit 20 loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    insert into private.client_errors(who, ver, ua, kind, msg, src, n)
    values (me->>'id', left(coalesce(r->>'ver',''),40), left(coalesce(r->>'ua',''),120), left(coalesce(nullif(r->>'kind',''),'error'),20),
            left(coalesce(r->>'msg',''),500), left(coalesce(r->>'src',''),200), least(greatest(coalesce(public._num(r->>'n')::int,1),1),1000));
    k := k + 1;
  end loop;
  return k;
end $function$
;
revoke all on function public.log_client_errors(p_rows jsonb) from public, anon, authenticated, service_role;
grant execute on function public.log_client_errors(p_rows jsonb) to authenticated;
grant execute on function public.log_client_errors(p_rows jsonb) to service_role;

-- public.recent_client_errors  [new (staging-only)]  staging md5 41254744a36e167b1ac51ca44b4cb263
CREATE OR REPLACE FUNCTION public.recent_client_errors(p_hours integer DEFAULT 24)
 RETURNS TABLE(at timestamp with time zone, who text, kind text, msg text, src text, n integer, ver text, ua text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.at, e.who, e.kind, e.msg, e.src, e.n, e.ver, e.ua from private.client_errors e
   where e.at > now() - make_interval(hours => least(greatest(coalesce(p_hours,24),1),24*60))
     and (public.my_emp_data()->>'role') = 'owner'
   order by e.at desc limit 500 $function$
;
revoke all on function public.recent_client_errors(p_hours integer) from public, anon, authenticated, service_role;
grant execute on function public.recent_client_errors(p_hours integer) to authenticated;
grant execute on function public.recent_client_errors(p_hours integer) to service_role;

-- public.error_digest  [new (staging-only)]  staging md5 91be54b3bd1a24f3d2f0b7401f2380fd
CREATE OR REPLACE FUNCTION public.error_digest()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tot int; ppl int; stuck int; refused int; crash int; top text; o record; nid text; msg text; n int := 0;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; day text := to_char(now() at time zone 'America/New_York', 'YYYYMMDD');
begin
  select coalesce(sum(e.n),0), count(distinct e.who),
         coalesce(sum(e.n) filter (where e.kind = 'stuck'),0), coalesce(sum(e.n) filter (where e.kind in ('refused','stock')),0),
         coalesce(sum(e.n) filter (where e.kind = 'error'),0)
    into tot, ppl, stuck, refused, crash
    from private.client_errors e where e.at > now() - interval '24 hours';
  if tot = 0 then return 0; end if;
  select string_agg(x, ' · ') into top from (
    select left(e.msg, 60) || ' (' || sum(e.n) || '×)' x from private.client_errors e
     where e.at > now() - interval '24 hours' group by left(e.msg, 60) order by sum(e.n) desc limit 3) q;
  for o in select id, data->>'lang' lang from public.records where coll = 'emps' and not deleted and data->>'role' = 'owner'
             and not coalesce((data->>'inactive')::boolean, false) loop
    nid := 'nerr' || day || o.id;
    if exists (select 1 from public.records where coll = 'inbox' and id = nid) then continue; end if;
    msg := case when o.lang = 'es'
      then '⚠ Problemas en la app (últimas 24 h): ' || tot || ' en ' || ppl || ' teléfono(s)'
           || case when stuck > 0 then ' · ' || stuck || ' con cambios sin enviar por horas' else '' end
           || case when refused > 0 then ' · ' || refused || ' cambios rechazados' else '' end || '. ' || coalesce(top, '')
      else '⚠ App problems in the last 24 h: ' || tot || ' on ' || ppl || ' phone(s)'
           || case when stuck > 0 then ' · ' || stuck || ' with changes unsent for hours' else '' end
           || case when refused > 0 then ' · ' || refused || ' refused changes' else '' end || '. ' || coalesce(top, '') end;
    insert into public.records (coll, id, data, deleted, updated_by, updated_at)
    values ('inbox', nid, jsonb_build_object('id', nid, 'to', o.id, 'msg', left(msg, 400), 'kind', 'warn', 'ts', nowms, 'read', false,
            'link', null, 'auto', true), false, 'server', now());
    n := n + 1;
  end loop;
  return n;
end $function$
;
revoke all on function public.error_digest() from public, anon, authenticated, service_role;
grant execute on function public.error_digest() to service_role;

-- public.notify_flush  [new (staging-only)]  staging md5 82e29f83bda586a4ecb4f26deed7de76
CREATE OR REPLACE FUNCTION public.notify_flush()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0; parts_en text; parts_es text; cnt int; ids bigint[];
begin
  for r in
    select to_id from private.notify_queue where sent is null group by to_id having max(created) < now() - interval '40 seconds'
  loop
    with q as (select * from private.notify_queue where sent is null and to_id = r.to_id),
         firsts as (select distinct on (qkey) qkey, sig_before from q order by qkey, created, id),
         lasts as (select distinct on (qkey) qkey, en, es, sig_after, created from q order by qkey, created desc, id desc),
         chg as (select l.* from lasts l join firsts f using (qkey) where coalesce(f.sig_before, '') is distinct from coalesce(l.sig_after, ''))
    select count(*), string_agg(en, ' · ' order by qkey), string_agg(es, ' · ' order by qkey), (select array_agg(id) from q)
      into cnt, parts_en, parts_es, ids from chg;
    if ids is null then select array_agg(id) into ids from private.notify_queue where sent is null and to_id = r.to_id; end if;
    if cnt = 1 then
      perform private.notify_now(r.to_id, '📅 Schedule · ' || parts_en, '📅 Horario · ' || parts_es, 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    elsif cnt > 1 then
      perform private.notify_now(r.to_id, left('📅 Your schedule changed (' || cnt || '): ' || parts_en, 400),
                                          left('📅 Tu horario cambió (' || cnt || '): ' || parts_es, 400), 'info', jsonb_build_object('tab', 'sched'), null);
      n := n + 1;
    end if;
    update private.notify_queue set sent = now() where id = any(ids);
  end loop;
  return n;
end $function$
;
revoke all on function public.notify_flush() from public, anon, authenticated, service_role;
grant execute on function public.notify_flush() to service_role;

-- public.meeting_reminders  [REPLACES production version]  staging md5 70c68cab51b88ca713f5fd7d63884e95
CREATE OR REPLACE FUNCTION public.meeting_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record; who text; n int := 0; nowms bigint := (extract(epoch from now())*1000)::bigint; tm text; mins int; msg text; nid text;
begin
  for m in
    select r.id, r.data, s.data->>'name' as site
    from records r left join records s on s.coll='sites' and s.id = r.data->>'site' and not s.deleted
    where r.coll='meets' and not r.deleted
      and (r.data->>'at') ~ '^[0-9]+$'
      and (r.data->>'at')::bigint > nowms
      and (r.data->>'at')::bigint <= nowms + 15*60*1000
      and coalesce(r.data->>'ping15','') <> (r.data->>'at')
  loop
    tm := to_char(to_timestamp((m.data->>'at')::bigint/1000) at time zone 'America/New_York', 'FMHH12:MI AM');
    mins := greatest(1, round(((m.data->>'at')::bigint - nowms)/60000.0))::int;
    for who in
      select distinct x from (
        select m.data->>'by' as x
        union select jsonb_array_elements_text(m.data->'with') where jsonb_typeof(m.data->'with') = 'array'
        union select id from records where not (m.data ? 'with') and coll='emps' and not deleted and data->>'role'='owner' and coalesce((data->>'inactive')::boolean,false)=false
      ) q where x is not null and x <> ''
    loop
      msg := '⏰ ' || tm || case when coalesce(private.emp_row(who)->>'lang','') = 'es' then ' (en ' || mins || ' min): ' || coalesce(m.data->>'title','Reunión')
                                  else ' (in ' || mins || ' min): ' || coalesce(m.data->>'title','Meeting') end || coalesce(' — ' || m.site, '');
      nid := 'n' || replace(gen_random_uuid()::text,'-','');
      insert into records (coll,id,data,deleted,updated_by,updated_at)
      values ('inbox', nid, jsonb_build_object('id',nid,'to',who,'msg',msg,'kind','info','ts',nowms,'read',false,'link',jsonb_build_object('tab','cal')), false, 'server', now());
      n := n + 1;
    end loop;
    update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
  end loop;
  return n;
end $function$
;
revoke all on function public.meeting_reminders() from public, anon, authenticated, service_role;
grant execute on function public.meeting_reminders() to service_role;

-- public.backup_note  [new (staging-only)]  staging md5 10cecc89effcbfdc749373a87ded742c
CREATE OR REPLACE FUNCTION public.backup_note(p_k text, p_v text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_k not in ('last_backup_records','last_backup_files') then raise exception 'not a backup note'; end if;
  update public.server_config set v = p_v where k = p_k;
  if not found then insert into public.server_config(k, v) values (p_k, p_v); end if;
end $function$
;
revoke all on function public.backup_note(p_k text, p_v text) from public, anon, authenticated, service_role;
grant execute on function public.backup_note(p_k text, p_v text) to service_role;

-- public.backup_files_since  [new (staging-only)]  staging md5 6615ab30393e661b29103a75e3103f0c
CREATE OR REPLACE FUNCTION public.backup_files_since(p_since timestamp with time zone)
 RETURNS TABLE(name text, type text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select o.name, o.metadata->>'mimetype', o.created_at from storage.objects o
   where o.bucket_id = 'files' and o.created_at > coalesce(p_since, 'epoch') order by o.created_at, o.name;
$function$
;
revoke all on function public.backup_files_since(p_since timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.backup_files_since(p_since timestamp with time zone) to service_role;

-- public.backup_snapshot  [new (staging-only)]  staging md5 e69cd97a4327b51983ac970478677dd6
CREATE OR REPLACE FUNCTION public.backup_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare recs jsonb; sa jsonb; files jsonb; fns jsonb; trg jsonb; pol jsonb; tbl jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('coll',coll,'id',id,'data',data,'deleted',deleted,'updated_by',updated_by,'updated_at',updated_at) order by coll,id),'[]'::jsonb) into recs from public.records;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',at,'fingerprint',fingerprint) order by id),'[]'::jsonb) into sa from public.stock_applied;
  select coalesce(jsonb_agg(jsonb_build_object('name',name,'size',(metadata->>'size')::bigint,'type',metadata->>'mimetype','updated_at',updated_at) order by name),'[]'::jsonb) into files from storage.objects where bucket_id = 'files';
  select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'def',pg_get_functiondef(p.oid)) order by n.nspname,p.proname),'[]'::jsonb) into fns
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prokind = 'f';
  select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'def',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname),'[]'::jsonb) into trg
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.schemaname,x.tablename,x.policyname),'[]'::jsonb) into pol from pg_policies x where x.schemaname in ('public','storage');
  select coalesce(jsonb_agg(jsonb_build_object('table',table_name,'columns',cols) order by table_name),'[]'::jsonb) into tbl from (
    select table_name, jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,'default',column_default,'null',is_nullable) order by ordinal_position) cols
    from information_schema.columns where table_schema = 'public' group by table_name) q;
  return jsonb_build_object('meta', jsonb_build_object('format','electrix-backup-1','taken_at',now(),'database',current_database(),
            'records',jsonb_array_length(recs),'records_md5',md5(recs::text),'stock_applied',jsonb_array_length(sa),'files',jsonb_array_length(files)),
         'records',recs,'stock_applied',sa,'files',files,
         'schema',jsonb_build_object('functions',fns,'triggers',trg,'policies',pol,'tables',tbl));
end $function$
;
revoke all on function public.backup_snapshot() from public, anon, authenticated, service_role;
grant execute on function public.backup_snapshot() to service_role;

-- public.backup_restore  [new (staging-only)]  staging md5 1bbc5aaa1ffa33c9318833f4f795c29a
CREATE OR REPLACE FUNCTION public.backup_restore(p jsonb, p_mode text DEFAULT 'check'::text, p_target text DEFAULT 'public'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb; cur record; missing int := 0; differ int := 0; same int := 0; written int := 0; newdata jsonb; tgt text;
begin
  if coalesce(p->'meta'->>'format','') <> 'electrix-backup-1' then raise exception 'not an Electrix backup'; end if;
  if p_mode not in ('check','missing','all') then raise exception 'mode must be check, missing or all'; end if;
  if p_target not in ('public','drill') then raise exception 'target must be public or drill'; end if;
  tgt := case when p_target = 'drill' then 'drill.records' else 'public.records' end;
  -- the encrypted file already proves it is complete and unchanged (AES-GCM + SHA-256); here we make sure nothing was cut off
  if jsonb_typeof(p->'records') <> 'array' or jsonb_array_length(p->'records') <> coalesce((p->'meta'->>'records')::int, -1) then
    raise exception 'backup file is incomplete (record count does not match)'; end if;
  for r in select value from jsonb_array_elements(p->'records') loop
    execute format('select data, deleted from %s where coll = $1 and id = $2', tgt) into cur using r->>'coll', r->>'id';
    if cur is null then missing := missing + 1;
    elsif cur.data is distinct from (r->'data') or cur.deleted is distinct from (r->>'deleted')::boolean then differ := differ + 1;
    else same := same + 1; continue; end if;
    if p_mode = 'check' then continue; end if;
    if p_mode = 'missing' and cur is not null and not (cur.deleted and not (r->>'deleted')::boolean) then continue; end if;
    newdata := r->'data';
    if r->>'coll' = 'sched' and cur is not null and jsonb_typeof(newdata) = 'object' then
      newdata := newdata || jsonb_build_object('rev', greatest(coalesce(public._num(newdata->>'rev'),0), coalesce(public._num(cur.data->>'rev'),0) + 1));
    end if;
    execute format('insert into %s(coll,id,data,deleted,updated_by,updated_at) values ($1,$2,$3,$4,$5,now())
                    on conflict (coll,id) do update set data = excluded.data, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_at = now()', tgt)
      using r->>'coll', r->>'id', newdata, (r->>'deleted')::boolean, 'restore:' || coalesce(p->'meta'->>'taken_at','?');
    written := written + 1;
  end loop;
  return jsonb_build_object('mode',p_mode,'target',p_target,'in_backup',jsonb_array_length(p->'records'),'same',same,'differ',differ,'missing',missing,'written',written);
end $function$
;
revoke all on function public.backup_restore(p jsonb, p_mode text, p_target text) from public, anon, authenticated, service_role;
grant execute on function public.backup_restore(p jsonb, p_mode text, p_target text) to service_role;

-- public.backup_health_check  [new (staging-only)]  staging md5 1863b038e36b1ba3f73e713063578e6b
CREATE OR REPLACE FUNCTION public.backup_health_check()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare last timestamptz; enabled boolean; o record; msg text;
begin
  enabled := exists (select 1 from public.server_config where k = 'backup_repo' and coalesce(v,'') <> '');
  if not enabled then return 'off-site backup not set up'; end if;
  select (v::jsonb->>'at')::timestamptz into last from public.server_config where k = 'last_backup_records';
  if last is not null and last > now() - interval '30 hours' then return 'ok: last backup ' || last; end if;
  msg := '⚠ Nightly backup is overdue' || case when last is null then ' (none yet)' else ' — last good copy ' || to_char(last at time zone 'America/New_York', 'Mon DD HH12:MI AM') end
         || '. Check the electrix-backups page on GitHub, or ask Claude.';
  for o in select id from public.records where coll = 'emps' and not deleted and data->>'role' = 'owner' loop
    insert into public.records(coll, id, data, deleted) values ('inbox', 'bk' || to_char(now(), 'YYYYMMDD') || o.id,
      jsonb_build_object('id', 'bk' || to_char(now(), 'YYYYMMDD') || o.id, 'to', o.id, 'ts', (extract(epoch from now()) * 1000)::bigint,
                         'msg', msg, 'from', o.id, 'kind', 'warn', 'link', null, 'read', false), false)
    on conflict (coll, id) do nothing;
  end loop;
  return 'alerted: ' || msg;
end $function$
;
revoke all on function public.backup_health_check() from public, anon, authenticated, service_role;
grant execute on function public.backup_health_check() to service_role;

-- ----- 6c. trigger functions -----

-- public.stamp_record  [REPLACES production version]  staging md5 f52794abe1e2ea7f08c1781c05971133
CREATE OR REPLACE FUNCTION public.stamp_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; bad text := '[''"\\<>`]';
begin
  if new.id !~ '^[A-Za-z0-9_.:|@-]{1,100}$' or new.coll !~ '^[A-Za-z_]{1,40}$' then
    raise exception 'bad record id' using errcode = '42501'; end if;
  if jsonb_typeof(new.data) = 'object' and (
       exists (select 1 from jsonb_each(new.data) e where e.key in ('id','site','who','by','to','from','crew','re','job','owner','manager','punch','approvedBy','doneBy','paidBy','ref','type')
               and jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') ~ bad)
    or exists (select 1 from jsonb_each(new.data) e, jsonb_array_elements_text(case when jsonb_typeof(e.value) = 'array' then e.value else '[]'::jsonb end) a
               where e.key in ('to','with','collab','share','managers') and a ~ bad)
    or exists (select 1 from jsonb_each(new.data) e where e.key like 'm\_%' and jsonb_typeof(e.value) = 'object'
               and (coalesce(e.value->>'re','') ~ bad or coalesce(e.value->>'by','') ~ bad or coalesce(e.value->>'kind','') ~ bad))) then
    raise exception 'bad characters in a reference field' using errcode = '42501'; end if;
  -- A2 size: photos go to file storage, so no record needs to be this big
  if current_user in ('authenticated','anon') and octet_length(new.data::text) > 400000 then
    raise exception 'record too large' using errcode = '42501'; end if;
  if current_user in ('authenticated','anon') and auth.uid() is not null then
    me := public.my_emp_data();
    new.updated_by := coalesce(me->>'id', 'uid:' || auth.uid()::text);
    new.updated_at := now();
  end if;
  return new;
end $function$
;
revoke all on function public.stamp_record() from public, anon, authenticated, service_role;
grant execute on function public.stamp_record() to public;
grant execute on function public.stamp_record() to anon;
grant execute on function public.stamp_record() to authenticated;
grant execute on function public.stamp_record() to service_role;

-- public.guard_record  [REPLACES production version]  staging md5 47c076253aae9855349d58699b5d6ac0
CREATE OR REPLACE FUNCTION public.guard_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; boss boolean; office boolean; payroll boolean; money boolean; hours boolean; approver boolean; material boolean;
        o jsonb; n jsonb := new.data; f text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' and private.row_exists(new.coll, new.id) then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role','');
  o := case when tg_op = 'UPDATE' then old.data else null end;
  if new.coll = 'inbox' and tg_op = 'INSERT' and jsonb_typeof(n) = 'object' then
    new.data := n || jsonb_build_object('from', me->>'id'); n := new.data; end if;
  if new.coll = 'push' and ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and o->>'who' is distinct from me->>'id')
                            or (not new.deleted and n->>'who' is distinct from me->>'id')) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if new.coll = 'emps' and not new.deleted and (
       (n ? 'authUid' and n->>'authUid' is distinct from o->>'authUid' and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and x.data->>'authUid' = n->>'authUid'))
    or (n ? 'authEmail' and lower(n->>'authEmail') is distinct from lower(o->>'authEmail') and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and lower(x.data->>'authEmail') = lower(n->>'authEmail')))) then
    raise exception 'that sign-in already belongs to someone' using errcode = '42501'; end if;
  -- A2 punches: server receive time, set once, never changed by a phone
  if new.coll = 'punches' and jsonb_typeof(n) = 'object' then
    if tg_op = 'INSERT' or old.deleted then new.data := (n - 'srvIn') || jsonb_build_object('srvIn', nowms);
    else new.data := (n - 'srvIn') || case when jsonb_typeof(o) = 'object' and o ? 'srvIn' then jsonb_build_object('srvIn', o->'srvIn') else '{}'::jsonb end; end if;
    n := new.data;
  end if;
  -- A5b keep: fields set by the server or by Payroll survive a phone re-sending an older whole copy
  if new.coll = 'punches' and tg_op = 'UPDATE' and jsonb_typeof(o) = 'object' and jsonb_typeof(n) = 'object'
     and not (role = 'owner' or (role = 'office' and me->>'title' = 'Payroll')) then
    n := n || coalesce((select jsonb_object_agg(k, o->k) from unnest(array['pending','approvedBy','rejected','rejectWhy']) k where o ? k and not n ? k), '{}'::jsonb);
    new.data := n;
  end if;
  if role = 'owner' then return new; end if;
  boss := public.is_boss();
  office := role = 'office';
  payroll := office and me->>'title' = 'Payroll';
  material := office and me->>'title' = 'Material';
  money := coalesce((me->>'all')::boolean,false) or (office and me->>'title' in ('Payroll','Bookkeeper'));
  hours := coalesce((me->>'all')::boolean,false) or payroll;
  approver := role in ('manager','office') or coalesce((me->>'all')::boolean,false);
  if new.coll = 'emps' then
    if boss then
      if public.emp_privileged(n) or coalesce(n->>'role','') = 'office'
         or (o is not null and (public.emp_privileged(o) or coalesce(o->>'role','') = 'office')) then
        if not (o is not null and old.id = me->>'id' and not new.deleted and (n - 'lang' - 'phone') = (o - 'lang' - 'phone')) then
          raise exception 'only the owner can change this person' using errcode = '42501'; end if;
      end if;
      return new;
    end if;
    if new.deleted or o is null or old.id <> me->>'id' or (n - 'lang' - 'phone') is distinct from (o - 'lang' - 'phone') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll in ('base','crews','sched','_') then
    if not boss then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'sites' then
    if not (boss or office) and (new.deleted
         or n->'lat' is distinct from o->'lat' or n->'lng' is distinct from o->'lng' or n->'rad' is distinct from o->'rad'
         or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip'
         or n->'travelPay' is distinct from o->'travelPay') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'stock' then
    if new.deleted and not (boss or material) then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'mats' then
    if new.deleted and not (boss or material or o->>'from' = me->>'id') then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'keep' then
    if o is not null and o->>'owner' is distinct from me->>'id' and (n->>'owner' is distinct from o->>'owner' or new.deleted) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'jobs' then
    if not boss and ((o is null and coalesce(n->>'from', me->>'id') <> me->>'id') or (o is not null and n->>'from' is distinct from o->>'from')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    if new.deleted and not boss and o->>'from' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    for f in select k from jsonb_object_keys(n) k where k like 'm\_%' loop
      if (o is null or o->f is distinct from n->f) and n->f->>'by' is distinct from me->>'id'
         and not (o ? f and ((n->f) - 'seen' - 'got') = ((o->f) - 'seen' - 'got')) then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end loop;
    return new;
  end if;
  if new.coll = 'meets' then
    if (o is null and n->>'by' is distinct from me->>'id') or (o is not null and o->>'by' is distinct from me->>'id') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll not in ('punches','timeoff','exps','travel','goHomeLog') then return new; end if;
  if new.coll = 'goHomeLog' then
    if not (role = 'manager' or coalesce((me->>'all')::boolean,false)) then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.deleted then
    if new.coll = 'punches' and not hours then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll = 'exps' and not money and (o->>'who' is distinct from me->>'id' or coalesce((o->>'paid')::boolean,false)) then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll in ('timeoff','travel') and not boss and o->>'who' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and n->>'who' is distinct from o->>'who'))
     and not (new.coll = 'punches' and hours) and not (new.coll = 'exps' and money) and not (new.coll in ('timeoff','travel') and boss) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  if new.coll = 'punches' and not hours then
    if tg_op = 'UPDATE' and old.deleted then raise exception 'only Payroll can bring back a deleted clock entry' using errcode = '42501'; end if;
    if o is not null and not private.punch_breaks_kept(o, n) then raise exception 'breaks can only be changed by Payroll' using errcode = '42501'; end if;
    if o is null and (public._num(n->>'in') is null or public._num(n->>'in') > nowms + 300000 or public._num(n->>'in') < nowms - 3*86400000
                      or (n->'out' is not null and n->'out' <> 'null'::jsonb and (public._num(n->>'out') < public._num(n->>'in') or public._num(n->>'out') > nowms + 300000))) then
      raise exception 'clock time out of range' using errcode = '42501'; end if;
    if coalesce(n->>'approvedBy','') <> coalesce(o->>'approvedBy','')
       or (coalesce((o->>'pending')::boolean,false) and not coalesce((n->>'pending')::boolean,false)) then
      if not approver or o is null or o->>'who' = me->>'id' or (n->>'approvedBy' is distinct from me->>'id' and coalesce(n->>'approvedBy','') <> '') then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
    if o is not null then
      if n->>'in' is distinct from o->>'in' or n->'edits' is distinct from o->'edits' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      if o->'out' is not null and o->'out' <> 'null'::jsonb and n->'out' is distinct from o->'out' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      if (o->'out' is null or o->'out' = 'null'::jsonb) and n->'out' is not null and n->'out' <> 'null'::jsonb then
        if o->>'who' is distinct from me->>'id' and not approver then raise exception 'not allowed' using errcode = '42501'; end if;
        if public._num(n->>'out') > nowms + 300000 or public._num(n->>'out') < public._num(o->>'in') then
          raise exception 'clock time out of range' using errcode = '42501'; end if;
      end if;
    end if;
  elsif new.coll = 'timeoff' and boss and coalesce(n->>'who', o->>'who') = me->>'id'
        and o is not null and n->>'status' is distinct from o->>'status' and n->>'status' in ('approved','denied') then
    raise exception 'your own time off is approved by the owner' using errcode = '42501';
  elsif new.coll = 'timeoff' and not boss then
    if (o is null and coalesce(n->>'status','pending') <> 'pending')
       or (o is not null and n->>'status' is distinct from o->>'status' and n->>'status' <> 'cancelled')
       or (o is not null and coalesce(o->>'status','pending') <> 'pending' and (n - 'status' - 'seen' - 'read') is distinct from (o - 'status' - 'seen' - 'read')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'exps' and not money then
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and (not boss or coalesce(n->>'who', o->>'who') = me->>'id') then
    if o is null or old.deleted then new.data := private.travel_checked(n, new.id); n := new.data; end if;
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'pay' is distinct from o->>'pay' or n->>'miles' is distinct from o->>'miles') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $function$
;
revoke all on function public.guard_record() from public, anon, authenticated, service_role;
grant execute on function public.guard_record() to public;
grant execute on function public.guard_record() to anon;
grant execute on function public.guard_record() to authenticated;
grant execute on function public.guard_record() to service_role;

-- public.guard_punch  [new (staging-only)]  staging md5 c3f0a4333c1c835621af2643d879ed64
CREATE OR REPLACE FUNCTION public.guard_punch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; role text; owner boolean; payroll boolean; clockok boolean; o jsonb; n jsonb := new.data;
        nowms bigint := (extract(epoch from now()) * 1000)::bigint; hist jsonb; late boolean; why text;
        chg boolean; LATE_MS constant bigint := 30 * 60000;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(n) <> 'object' then return new; end if;
  me := public.my_emp_data(); if me = '{}'::jsonb then return new; end if;
  role := coalesce(me->>'role',''); owner := role = 'owner';
  payroll := role = 'office' and me->>'title' = 'Payroll';
  clockok := owner or payroll;
  o := case when tg_op = 'UPDATE' and jsonb_typeof(old.data) = 'object' then old.data end;
  n := (n - 'hist' - 'lateEntry')
       || case when o ? 'lateEntry' then jsonb_build_object('lateEntry', o->'lateEntry') else '{}'::jsonb end;
  hist := case when coalesce(jsonb_typeof(o->'hist'),'') = 'array' then o->'hist' else '[]'::jsonb end;

  if new.deleted then
    if tg_op = 'UPDATE' and old.deleted then new.data := old.data; return new; end if;
    if not clockok then raise exception 'only the owner or Payroll can remove a clock entry' using errcode = '42501'; end if;
    new.data := coalesce(o, n) || jsonb_build_object('deletedBy', me->>'id', 'deletedAt', nowms,
                 'hist', hist || jsonb_build_array(jsonb_build_object('act','deleted','by',me->>'id','at',nowms)));
    return new;
  end if;

  if o is null or old.deleted then
    late := coalesce(public._num(n->>'in'), nowms) < nowms - LATE_MS;
    if n->>'who' is distinct from me->>'id' and not clockok then
      raise exception 'only the owner or Payroll can add a clock entry for someone else' using errcode = '42501'; end if;
    if clockok and (n->>'who' is distinct from me->>'id' or o is not null) then
      why := private.last_why(n);
      if why is null then raise exception 'a reason is required for a clock entry added by the office' using errcode = '42501'; end if;
      hist := hist || jsonb_build_array(jsonb_build_object('act', case when o is null then 'added' else 'restored' end,'by',me->>'id','at',nowms,
                 'in',n->'in','out',n->'out','who',n->'who','why',why));
    elsif late then
      n := n || jsonb_build_object('pending', true,
             'lateEntry', jsonb_build_object('srvIn', nowms, 'in', n->'in', 'out', n->'out', 'site', n->'site', 'by', me->>'id'));
      hist := hist || jsonb_build_array(jsonb_build_object('act','late','by',me->>'id','at',nowms,'in',n->'in','out',n->'out',
                 'minutesLate', round((nowms - public._num(n->>'in')) / 60000.0)));
    else
      hist := hist || jsonb_build_array(jsonb_build_object('act','created','by',me->>'id','at',nowms,'in',n->'in'));
    end if;
    new.data := n || jsonb_build_object('hist', hist);
    return new;
  end if;

  -- A5b close: only Owner/Payroll end someone else's open clock entry (a manager's "not approved" answer to a
  -- "clock me in" request ends it at its own start and is the one exception)
  if coalesce(o->'out','null'::jsonb) = 'null'::jsonb and coalesce(n->'out','null'::jsonb) <> 'null'::jsonb
     and o->>'who' is distinct from me->>'id' and not clockok
     and not (coalesce(o->'pending' = 'true'::jsonb, false) and n->'out' = n->'in') then
    raise exception 'only the owner or Payroll can clock someone else out' using errcode = '42501'; end if;
  if not private.edits_prefix_kept(o->'edits', n->'edits') then
    raise exception 'the change history of a clock entry cannot be rewritten' using errcode = '42501'; end if;
  chg := n->'in' is distinct from o->'in' or n->'who' is distinct from o->'who' or n->'site' is distinct from o->'site'
      or (coalesce(o->'out','null'::jsonb) <> 'null'::jsonb and n->'out' is distinct from o->'out')
      or n->'voided' is distinct from o->'voided'
      or not private.punch_breaks_kept(o, n);
  if chg then
    if not clockok then raise exception 'only the owner or Payroll can change clock times' using errcode = '42501'; end if;
    why := private.last_why(n);
    if why is null or private.arr_len(n->'edits') <= private.arr_len(o->'edits') then
      raise exception 'a reason is required to change clock times' using errcode = '42501'; end if;
    hist := hist || jsonb_build_array(jsonb_build_object('act', case when n ? 'voided' and not (o ? 'voided') then 'voided'
                                                               when o ? 'voided' and not (n ? 'voided') then 'unvoided' else 'edited' end,
              'by',me->>'id','at',nowms,'why',why,
              'from',jsonb_build_object('in',o->'in','out',o->'out','who',o->'who','site',o->'site'),
              'to',jsonb_build_object('in',n->'in','out',n->'out','who',n->'who','site',n->'site')));
  end if;
  if coalesce((o->'pending' = 'true'::jsonb),false) and not coalesce((n->'pending' = 'true'::jsonb),false) then
    if o ? 'lateEntry' then
      if not clockok then raise exception 'only Payroll can approve a late clock entry' using errcode = '42501'; end if;
      if o->>'who' = me->>'id' and not owner then raise exception 'someone else must approve your own clock entry' using errcode = '42501'; end if;
      if coalesce((n->'rejected' = 'true'::jsonb),false) and length(trim(coalesce(n->>'rejectWhy',''))) < 3 then
        raise exception 'a reason is required to reject a clock entry' using errcode = '42501'; end if;
    end if;
    hist := hist || jsonb_build_array(jsonb_build_object('act', case when coalesce((n->'rejected' = 'true'::jsonb),false) then 'rejected' else 'approved' end,
              'by',me->>'id','at',nowms,'why',nullif(trim(coalesce(n->>'rejectWhy','')),'')));
  end if;
  if o ? 'lateEntry' and not clockok and (n->'rejected' is distinct from o->'rejected' or n->'approvedBy' is distinct from o->'approvedBy') then
    raise exception 'only Payroll can approve a late clock entry' using errcode = '42501'; end if;
  new.data := n || jsonb_build_object('hist', hist);
  return new;
end $function$
;
revoke all on function public.guard_punch() from public, anon, authenticated, service_role;
grant execute on function public.guard_punch() to public;
grant execute on function public.guard_punch() to anon;
grant execute on function public.guard_punch() to authenticated;
grant execute on function public.guard_punch() to service_role;

-- public.guard_emp_pay  [new (staging-only)]  staging md5 fd65934170746a75f05054cddd0f67a4
CREATE OR REPLACE FUNCTION public.guard_emp_pay()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare me jsonb; oldv jsonb;
begin
  if current_user not in ('authenticated', 'anon') or auth.uid() is null then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  oldv := case when tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then old.data->'payMonthly' end;
  if coalesce(new.data->'payMonthly', 'false'::jsonb) = coalesce(oldv, 'false'::jsonb) then return new; end if;
  me := public.my_emp_data();
  if me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll') then return new; end if;
  new.data := (new.data - 'payMonthly') || case when oldv is not null then jsonb_build_object('payMonthly', oldv) else '{}'::jsonb end;
  return new;
end $function$
;
revoke all on function public.guard_emp_pay() from public, anon, authenticated, service_role;
grant execute on function public.guard_emp_pay() to public;
grant execute on function public.guard_emp_pay() to anon;
grant execute on function public.guard_emp_pay() to authenticated;
grant execute on function public.guard_emp_pay() to service_role;

-- public.guard_stock_qty  [REPLACES production version]  staging md5 ffae2d53aafe84ac874aa1128b6a9474
CREATE OR REPLACE FUNCTION public.guard_stock_qty()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if coalesce(current_setting('app.stock_txn', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if tg_op = 'UPDATE' then
    new.data := (new.data - 'qty' - 'qv')
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qty' then jsonb_build_object('qty', old.data->'qty') else '{}'::jsonb end
      || case when jsonb_typeof(old.data) = 'object' and old.data ? 'qv' then jsonb_build_object('qv', old.data->'qv') else '{}'::jsonb end;
  else
    new.data := (new.data - 'qty' - 'qv') || '{"qty":0}'::jsonb;
  end if;
  return new;
end $function$
;
revoke all on function public.guard_stock_qty() from public, anon, authenticated, service_role;
grant execute on function public.guard_stock_qty() to public;
grant execute on function public.guard_stock_qty() to anon;
grant execute on function public.guard_stock_qty() to authenticated;
grant execute on function public.guard_stock_qty() to service_role;

-- public.on_record_change  [REPLACES production version]  staging md5 7a111c9b90636c1915a24d99b682d66e
CREATE OR REPLACE FUNCTION public.on_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare base text; secret text;
begin
  if new.deleted or new.coll not in ('inbox','sites') then return new; end if;
  if new.coll = 'inbox' and tg_op <> 'INSERT' then return new; end if;
  if new.coll = 'sites' and (tg_op <> 'UPDATE' or coalesce(new.data->>'stage','') = coalesce(old.data->>'stage','') or coalesce(new.data->>'trello','') = '') then return new; end if;
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  if new.coll = 'inbox' then
    perform net.http_post(url := base || '/notify',
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg', 'id', new.id,
                                 'ts', case when (new.data->>'ts') ~ '^[0-9]+$' then (new.data->>'ts')::bigint end),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$
;
revoke all on function public.on_record_change() from public, anon, authenticated, service_role;
grant execute on function public.on_record_change() to service_role;

-- public.notify_assign  [new (staging-only)]  staging md5 614cf04c66eb47f8f561bdedd5be93a1
CREATE OR REPLACE FUNCTION public.notify_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me jsonb; actor text; aname text; n jsonb := new.data; o jsonb := '{}'::jsonb; who text; e jsonb; site text; d text;
        pri boolean; en text; es text; office boolean; isnew boolean; day date; tdy date := (now() at time zone 'America/New_York')::date;
        crew text; sig_o text; sig_n text; txt text; k text;
begin
  if auth.uid() is null then return null; end if;
  if new.deleted or jsonb_typeof(n) <> 'object' then return null; end if;
  if tg_op = 'UPDATE' and not old.deleted and jsonb_typeof(old.data) = 'object' then o := old.data; end if;
  isnew := o = '{}'::jsonb;
  begin
    me := public.my_emp_data(); actor := me->>'id'; aname := coalesce(nullif(private.emp_row(actor)->>'name', ''), 'Office');

    if new.coll = 'jobs' then
      if coalesce(n->>'status', '') = 'done' then return null; end if;
      pri := coalesce((n->>'pri')::boolean, false); site := private.short_site(n->>'site');
      for who in select x from private.expand_people(n->'to') x except select y from private.expand_people(o->'to') y loop
        e := private.emp_row(who); office := e->>'role' = 'office';
        d := case when coalesce(n->>'descLang', '') = '' or n->>'descLang' = coalesce(e->>'lang', 'en') or coalesce(n->>'descTr', '') = ''
                  then coalesce(n->>'desc', '') else n->>'descTr' end;
        en := case when pri then '🔴 PRIORITY — ' else '' end
              || case when isnew then case when office then 'New task from ' else 'New job from ' end else 'Moved to you by ' end
              || aname || ': ' || case when site <> '' then site || ' — ' else '' end || left(d, 60);
        es := case when pri then '🔴 PRIORIDAD — ' else '' end
              || case when isnew then case when office then 'Nueva tarea de ' else 'Nuevo trabajo de ' end else 'Te lo pasó ' end
              || aname || ': ' || case when site <> '' then site || ' — ' else '' end || left(d, 60);
        perform private.notify_now(who, en, es, case when pri then 'pri' else 'info' end, jsonb_build_object('job', new.id), actor);
      end loop;
      if not isnew then
        for who in select y from private.expand_people(o->'to') y except select x from private.expand_people(n->'to') x loop
          e := private.emp_row(who);
          d := case when coalesce(n->>'descLang', '') = '' or n->>'descLang' = coalesce(e->>'lang', 'en') or coalesce(n->>'descTr', '') = ''
                    then coalesce(n->>'desc', '') else n->>'descTr' end;
          perform private.notify_now(who, 'Taken off your list: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),
                                          'Quitado de tu lista: ' || case when site <> '' then site || ' — ' else '' end || left(d, 50),
                                          'info', jsonb_build_object('tab', 'jobs'), actor);
        end loop;
      end if;

    elsif new.coll = 'tickets' then
      if coalesce(n->>'to', '') <> '' and n->>'to' is distinct from o->>'to' and coalesce(n->>'status', '') <> 'done' then
        site := coalesce(nullif(private.short_site(n->>'site'), ''), n->>'addr', '');
        pri := coalesce((n->>'pri')::boolean, false);
        perform private.notify_now(n->>'to',
          case when pri then '🔴 ' else '' end || '🔧 Service call for you: ' || site || ' — ' || left(coalesce(n->>'issue', ''), 50),
          case when pri then '🔴 ' else '' end || '🔧 Llamada de servicio para ti: ' || site || ' — ' || left(coalesce(n->>'issue', ''), 50),
          case when pri then 'pri' else 'info' end, jsonb_build_object('svc', new.id), actor);
      end if;

    elsif new.coll = 'sites' then
      site := split_part(coalesce(n->>'name', ''), ',', 1);
      if coalesce(n->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        for who in select x from private.expand_people(jsonb_build_array(n->>'crew')) x loop
          perform private.notify_now(who, '📁 Your crew now has ' || site || ' — plans and files are in the job folder',
                                          '📁 Tu cuadrilla ahora tiene ' || site || ' — los planos y archivos están en la carpeta del trabajo',
                                          'info', jsonb_build_object('site', new.id), actor);
        end loop;
      end if;
      if coalesce(o->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        crew := private.crew_name(n->>'crew');
        for who in select x from private.expand_people(jsonb_build_array(o->>'crew')) x except select y from private.expand_people(jsonb_build_array(n->>'crew')) y loop
          perform private.notify_now(who,
            '📁 ' || site || case when crew <> '' then ' moved to ' || crew else ' is no longer with your crew' end,
            '📁 ' || site || case when crew <> '' then ' pasó a ' || crew else ' ya no está con tu cuadrilla' end,
            'info', jsonb_build_object('tab', 'sites'), actor);
        end loop;
      end if;
      if coalesce(n->>'manager', '') <> '' and n->>'manager' is distinct from o->>'manager' then
        perform private.notify_now(n->>'manager', '📁 You are the site manager for ' || site, '📁 Eres el encargado de ' || site,
                                   'info', jsonb_build_object('site', new.id), actor);
      end if;

    elsif new.coll = 'emps' then
      if not isnew and coalesce(n->>'crew', '') <> '' and n->>'crew' is distinct from o->>'crew' then
        crew := private.crew_name(n->>'crew');
        perform private.notify_now(new.id, '👷 You are now on ' || crew || ' (' || aname || ')', '👷 Ahora estás en ' || crew || ' (' || aname || ')',
                                   'info', jsonb_build_object('tab', 'punch'), actor);
      end if;

    elsif new.coll = 'sched' then
      sig_o := private.sched_sig(o); sig_n := private.sched_sig(n);
      if sig_o = sig_n then return null; end if;
      k := new.id;
      if k ~ '^ONG:' then
        crew := split_part(k, ':', 2);
        if coalesce(n->>'to', '') <> '' and n->>'to' ~ '^\d{4}-\d{2}-\d{2}$' then
          if (n->>'to')::date < tdy then return null; end if;
          en := '♾ Ongoing job at ' || private.short_site(n->>'site') || ' ends after ' || private.day_label((n->>'to')::date, 'en');
          es := '♾ El trabajo fijo en ' || private.short_site(n->>'site') || ' termina después del ' || private.day_label((n->>'to')::date, 'es');
        else
          day := case when coalesce(n->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$' then greatest((n->>'from')::date, tdy) else tdy end;
          en := '♾ Every working day from ' || private.day_label(day, 'en') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start');
          es := '♾ Cada día laboral desde ' || private.day_label(day, 'es') || ': ' || private.short_site(n->>'site') || ' ' || private.min_label(n->>'start');
        end if;
        for who in select x from private.expand_people(jsonb_build_array(crew)) x loop
          if who <> coalesce(actor, '') then
            insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
            values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
          end if;
        end loop;
        return null;
      end if;
      if split_part(k, '|', 2) !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
      day := split_part(k, '|', 2)::date;
      if day < tdy or day > tdy + 21 then return null; end if;
      txt := private.sched_text(n);
      if k ~ '^L:' then
        who := substr(split_part(k, '|', 1), 3);
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then 'you are moved to ' || txt else 'your move was cancelled — you are back with your crew' end;
        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then 'te mueven a ' || txt else 'se canceló tu cambio — vuelves con tu cuadrilla' end;
        if who <> coalesce(actor, '') then
          insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
          values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
        end if;
      else
        crew := split_part(k, '|', 1);
        en := private.day_label(day, 'en') || ': ' || case when txt <> '' then txt
                when coalesce(n->>'cancel', '') <> '' or coalesce(n->>'replace', '') <> '' then 'changed — open the schedule'
                else 'no job scheduled for your crew' end;
        es := private.day_label(day, 'es') || ': ' || case when txt <> '' then txt
                when coalesce(n->>'cancel', '') <> '' or coalesce(n->>'replace', '') <> '' then 'cambió — abre el horario'
                else 'sin trabajo programado para tu cuadrilla' end;
        for who in select x from private.expand_people(jsonb_build_array(crew)) x loop
          if who <> coalesce(actor, '') then
            insert into private.notify_queue(to_id, qkey, actor, en, es, sig_before, sig_after, link)
            values (who, k, actor, en, es, sig_o, sig_n, jsonb_build_object('tab', 'sched'));
          end if;
        end loop;
      end if;
    end if;
  exception when others then
    raise warning 'notify_assign % %: %', new.coll, new.id, sqlerrm;
  end;
  return null;
end $function$
;
revoke all on function public.notify_assign() from public, anon, authenticated, service_role;
grant execute on function public.notify_assign() to service_role;

-- ===== 7. grant-only alignment: identical bodies, but production also grants EXECUTE to authenticated (staging does not) =====
revoke all on function public.guard_emphr() from public, anon, authenticated, service_role;
grant execute on function public.guard_emphr() to service_role;
revoke all on function public.guard_fields() from public, anon, authenticated, service_role;
grant execute on function public.guard_fields() to service_role;
revoke all on function public.lock_record_key() from public, anon, authenticated, service_role;
grant execute on function public.lock_record_key() to service_role;

-- ===== 8. triggers on public.records (staging definitions; PG17 supports CREATE OR REPLACE TRIGGER) =====
-- records_guard_emphr differs: production fires on coll='emphr', staging on 'empHR' (+ records_guard_emphr2 for 'emphr').
CREATE OR REPLACE TRIGGER records_guard_emphr BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = 'empHR'::text)) EXECUTE FUNCTION guard_emphr();
CREATE OR REPLACE TRIGGER records_guard_emphr2 BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = 'emphr'::text)) EXECUTE FUNCTION guard_emphr();
CREATE OR REPLACE TRIGGER records_guard_emppay BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = 'emps'::text)) EXECUTE FUNCTION guard_emp_pay();
CREATE OR REPLACE TRIGGER records_guard_punch BEFORE INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = 'punches'::text)) EXECUTE FUNCTION guard_punch();
CREATE OR REPLACE TRIGGER records_zz_notify_assign AFTER INSERT OR UPDATE ON public.records FOR EACH ROW WHEN ((new.coll = ANY (ARRAY['jobs'::text, 'tickets'::text, 'sites'::text, 'emps'::text, 'sched'::text]))) EXECUTE FUNCTION notify_assign();
alter table public.records enable trigger records_guard_emphr;   -- staging tgenabled = 'O'
alter table public.records enable trigger records_guard_emphr2;   -- staging tgenabled = 'O'
alter table public.records enable trigger records_guard_emppay;   -- staging tgenabled = 'O'
alter table public.records enable trigger records_guard_punch;   -- staging tgenabled = 'O'
alter table public.records enable trigger records_zz_notify_assign;   -- staging tgenabled = 'O'

-- ===== 9. RLS policies: identical shape, staging restricts roles to authenticated (production: public) =====
alter policy "members claim" on public.stock_applied to authenticated;
alter policy "members read" on public.stock_applied to authenticated;

-- ===== 10. cron jobs present on staging, missing on production (backup-health is in 20_backups_optional.sql) =====
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'assign-notify') then
    perform cron.schedule('assign-notify', '* * * * *', $c$select public.notify_flush()$c$);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'error-digest') then
    perform cron.schedule('error-digest', '37 11 * * *', $c$select public.error_digest()$c$);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'error-log-tidy') then
    perform cron.schedule('error-log-tidy', '41 3 * * 0', $c$select private.tidy_client_errors()$c$);
  end if;
end $$;
commit;

/* ===== VERIFY after commit (read-only). Every row should show ok = true. =====
with expected(fn, md5) as (values
  ('private.arr_len', '7b5c86192b14f4ead31825008619e593'),
  ('private.crew_name', '697c54083dfda8dd32d98bce1712f48d'),
  ('private.day_label', '65f3d0ec9884f978389142cbea2c234f'),
  ('private.edits_prefix_kept', '70903d004551a638b570919c990a1063'),
  ('private.emp_row', 'edb053a111930d6c32302e4c7701882f'),
  ('private.expand_people', 'e3548691f8e86ef48a4361fb10d4ab25'),
  ('private.last_why', '22de8a8499c4a68b7f49a99bd1967174'),
  ('private.min_label', 'f5b25597b8d63942bb3a4ef8f948675f'),
  ('private.short_site', 'd6dcce1aa7a70f7eaaa03b8c8346726f'),
  ('private.sched_sig', 'e35f981a11033f4cd8362d9cd0ff636f'),
  ('private.sched_text', '597c0ff801719d641f2933ac50e613a0'),
  ('private.punch_breaks_kept', 'e273c2ac0814a9bc49affe7c4cf1ccb5'),
  ('private.travel_checked', '72c7d74496d13a9f2ffe0aef23d9b342'),
  ('private.notify_now', '5f339e028bb1b2212714fdd7e9b08371'),
  ('private.tidy_client_errors', '658a69525f76f54797f23c211101440e'),
  ('public.can_see2', 'bb52dde12643dc2d42d29486317569c9'),
  ('public.save_records', '4eb565356a50caa8c9b5e73eaf140b2f'),
  ('public.apply_stock_moves', '31d1b5735e1f5f4d69a6febd3daec083'),
  ('public.apply_stock_txn', 'dad5618df00db4ddef4617307d16c89e'),
  ('public.history_records', '81569f348f9bd75ff3aa3feb4ad13658'),
  ('public.stock_item_history', 'ba9945af43029ba7e41b9855b1eae22c'),
  ('public.stock_site_history', '779c2d207a41fc5da7abd0a627ab61bd'),
  ('public.ai_take', 'da5b4654722bcbd7c1391ce6ee1c896f'),
  ('public.log_client_errors', 'df06dd78617b35bfdc2a6da81020f86b'),
  ('public.recent_client_errors', '41254744a36e167b1ac51ca44b4cb263'),
  ('public.error_digest', '91be54b3bd1a24f3d2f0b7401f2380fd'),
  ('public.notify_flush', '82e29f83bda586a4ecb4f26deed7de76'),
  ('public.meeting_reminders', '70c68cab51b88ca713f5fd7d63884e95'),
  ('public.backup_note', '10cecc89effcbfdc749373a87ded742c'),
  ('public.backup_files_since', '6615ab30393e661b29103a75e3103f0c'),
  ('public.backup_snapshot', 'e69cd97a4327b51983ac970478677dd6'),
  ('public.backup_restore', '1bbc5aaa1ffa33c9318833f4f795c29a'),
  ('public.backup_health_check', '1863b038e36b1ba3f73e713063578e6b'),
  ('public.stamp_record', 'f52794abe1e2ea7f08c1781c05971133'),
  ('public.guard_record', '47c076253aae9855349d58699b5d6ac0'),
  ('public.guard_punch', 'c3f0a4333c1c835621af2643d879ed64'),
  ('public.guard_emp_pay', 'fd65934170746a75f05054cddd0f67a4'),
  ('public.guard_stock_qty', 'ffae2d53aafe84ac874aa1128b6a9474'),
  ('public.on_record_change', '7a111c9b90636c1915a24d99b682d66e'),
  ('public.notify_assign', '614cf04c66eb47f8f561bdedd5be93a1'))
select e.fn, e.md5 as expected, md5(pg_get_functiondef(p.oid)) as actual, e.md5 = md5(pg_get_functiondef(p.oid)) as ok
  from expected e
  left join pg_proc p on p.oid = to_regproc(e.fn)
 order by e.fn;

-- triggers (expected md5(pg_get_triggerdef) with search_path containing public):
--   records_guard_emphr          e36bf9cce46dacc57dece831ac6b7668
--   records_guard_emphr2         664ad95fef93fee6dc3b6887e5af511c
--   records_guard_emppay         947cb684cb6acacb3085b127e033b6a1
--   records_guard_punch          48df3063ddc624ecfc0da7fc73fe58ab
--   records_zz_notify_assign     8520aa095af62dda5a8498f2fe2232e1
select tgname, tgenabled, md5(pg_get_triggerdef(oid)) from pg_trigger where tgrelid = 'public.records'::regclass and not tgisinternal order by 1;
select jobname, schedule, command from cron.job order by 1;
*/
