-- Electrix USA Field Manager — database setup
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run again.

create extension if not exists pgcrypto;

-- one table holds every record of the app (jobs, punches, notes, schedule, ...)
create table if not exists public.records (
  coll        text not null,
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (coll, id)
);
create index if not exists records_coll_idx on public.records (coll);
create index if not exists records_updated_idx on public.records (updated_at);

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;
grant select, insert, update on public.records to authenticated;

-- who is on the team: every active employee record carries authEmail
create or replace function public.is_member() returns boolean
language sql security definer stable set search_path = public as $$
  select
    (not exists (select 1 from public.records where coll = 'emps' and not deleted))  -- first run: nobody yet → allow setup
    or exists (
      select 1 from public.records r
      where r.coll = 'emps' and not r.deleted
        and r.data->>'authUid' = auth.uid()::text
        and coalesce((r.data->>'inactive')::boolean, false) = false
    );
$$;

create or replace function public.is_boss() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.records r
    where r.coll = 'emps' and not r.deleted
      and r.data->>'authUid' = auth.uid()::text
      and coalesce((r.data->>'inactive')::boolean, false) = false
      and (r.data->>'role' in ('owner','manager') or coalesce((r.data->>'all')::boolean,false)
           or (r.data->>'role' = 'office' and r.data->>'title' = 'Payroll'))
  );
$$;

alter table public.records enable row level security;
drop policy if exists "team can read" on public.records;
drop policy if exists "team can write" on public.records;
drop policy if exists "team can update" on public.records;
-- notes are private: only the person who wrote it and the people it is shared with
create or replace function public.my_emp() returns text
language sql security definer stable set search_path = public as $$
  select id from public.records where coll = 'emps' and not deleted and data->>'authUid' = auth.uid()::text limit 1;
$$;
create or replace function public.no_team_yet() returns boolean
language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.records where coll = 'emps' and not deleted);
$$;
create or replace function public.can_see(c text, d jsonb) returns boolean
language sql stable set search_path = public as $$
  select c <> 'keep' or d->>'owner' = public.my_emp() or coalesce(d->'collab', '[]'::jsonb) ? public.my_emp();
$$;
create policy "team can read"   on public.records for select to authenticated using (public.is_member() and public.can_see(coll, data));
create policy "team can write"  on public.records for insert to authenticated with check (public.is_member() and (coll <> 'keep' or data->>'owner' = public.my_emp() or public.no_team_yet()));
create policy "team can update" on public.records for update to authenticated using (public.is_member() and public.can_see(coll, data)) with check (public.is_member());

-- saving: only the fields that changed are merged, so two phones editing different parts of the same job don't overwrite each other
drop function if exists public.save_records(jsonb);
create or replace function public.save_records(rows jsonb) returns table (coll text, id text, data jsonb, deleted boolean)
language plpgsql security invoker set search_path = public as $$
#variable_conflict use_column
declare r jsonb; un text[];
begin
  for r in select * from jsonb_array_elements(rows) loop
    if coalesce((r->>'deleted')::boolean, false) then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'full', '{}'::jsonb), true, r->>'by', now())
      on conflict (coll, id) do update set data = coalesce(r->'full', '{}'::jsonb), deleted = true, updated_by = r->>'by', updated_at = now();
    elsif r ? 'full' then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', r->'full', false, r->>'by', now())
      on conflict (coll, id) do update set data = r->'full', deleted = false, updated_by = r->>'by', updated_at = now();
    else
      un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'patch', '{}'::jsonb), false, r->>'by', now())
      on conflict (coll, id) do update
        set data = case when t.deleted then coalesce(r->'patch', '{}'::jsonb) else (t.data || coalesce(r->'patch', '{}'::jsonb)) - un end,
            deleted = false, updated_by = r->>'by', updated_at = now();
    end if;
  end loop;
  -- hand back the merged result so the phone ends up with exactly what the server has
  return query select t.coll, t.id, t.data, t.deleted from public.records t
    join (select x->>'coll' as c, x->>'id' as i from jsonb_array_elements(rows) x) k on t.coll = k.c and t.id = k.i;
end $$;
grant execute on function public.save_records(jsonb) to authenticated;

-- sign-in by name / phone: returns only the login email, nothing else
create or replace function public.resolve_login(q text) returns text
language plpgsql security definer stable set search_path = public as $$
declare
  qq text := lower(trim(q));
  dig text := regexp_replace(q, '\D', '', 'g');
  em text;
begin
  if qq = '' then return null; end if;
  select r.data->>'authEmail' into em
  from public.records r
  where r.coll = 'emps' and not r.deleted
    and coalesce((r.data->>'inactive')::boolean, false) = false
    and (
      lower(r.data->>'name') = qq
      or lower(coalesce(r.data->>'email','')) = qq
      or lower(coalesce(r.data->>'authEmail','')) = qq
      or (length(dig) >= 7 and regexp_replace(coalesce(r.data->>'phone',''), '\D', '', 'g') = dig)
      or lower(split_part(r.data->>'name',' ',1)) = qq
    )
  order by (lower(r.data->>'name') = qq) desc
  limit 1;
  return em;
end $$;
grant execute on function public.resolve_login(text) to anon, authenticated;

-- strong passwords: 8+ characters, letters and numbers, not a common one (the app checks this too)
create or replace function public._pw_check(p text) returns void language plpgsql immutable set search_path = public as $$
declare l text := lower(coalesce(p,''));
begin
  if length(coalesce(p,'')) < 8 then raise exception 'password too short'; end if;
  if p !~ '[A-Za-z]' or p !~ '[0-9]' then raise exception 'password needs letters and numbers'; end if;
  if l = any(array['password1','password123','qwerty123','abc12345','abcd1234','iloveyou1','admin123','welcome1','letmein1','monkey123','passw0rd','electrix1','electrix123','electrix2026','monsey123','spring123'])
     or l ~ 'electrix' or p ~ '^(.)\1+$' then raise exception 'password too common'; end if;
end $$;
revoke all on function public._pw_check(text) from public, anon, authenticated;

-- the office can set / reset someone's password
-- returns the sign-in's id so the employee record can be tied to it
drop function if exists public.admin_set_password(text, text);
create or replace function public.admin_set_password(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not public.is_boss() then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email) returning id into uid;
  return uid;
end $$;
grant execute on function public.admin_set_password(text, text) to authenticated;

-- sign-ins are created here directly (no confirmation emails, works for the whole team at once)
create or replace function public._make_user(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  if not (public.is_boss() or public.no_team_yet()) then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  select id into uid from auth.users where lower(email) = em;
  if uid is not null then
    update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
    return uid;
  end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(p_pass, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;
revoke all on function public._make_user(text, text) from public, anon, authenticated;

-- office creates a sign-in for an employee
create or replace function public.admin_create_user(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_boss() then raise exception 'not allowed'; end if;
  return public._make_user(p_email, p_pass);
end $$;
grant execute on function public.admin_create_user(text, text) to authenticated;

-- very first sign-in: only possible while the team list is still empty
create or replace function public.setup_owner(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.no_team_yet() then raise exception 'already set up'; end if;
  return public._make_user(p_email, p_pass);
end $$;
grant execute on function public.setup_owner(text, text) to anon, authenticated;

-- photos and files
insert into storage.buckets (id, name, public) values ('files', 'files', true)
on conflict (id) do update set public = true;
drop policy if exists "team uploads" on storage.objects;
drop policy if exists "team updates files" on storage.objects;
drop policy if exists "public reads files" on storage.objects;
create policy "team uploads"       on storage.objects for insert to authenticated with check (bucket_id = 'files' and public.is_member());
create policy "team updates files" on storage.objects for update to authenticated using (bucket_id = 'files' and public.is_member());
create policy "public reads files" on storage.objects for select using (bucket_id = 'files');

-- used by the server functions to check the caller is on the team
grant execute on function public.is_member() to authenticated;

-- ===== phone notifications + Trello moves =====
-- After deploying the "notify" and "trello" functions, put your project address and a secret word here (see the setup guide).
create extension if not exists pg_net;
create table if not exists public.server_config (k text primary key, v text not null);
alter table public.server_config enable row level security;   -- nobody reads it from the app

create or replace function public.on_record_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare base text; secret text;
begin
  select v into base from public.server_config where k = 'functions_url';
  select v into secret from public.server_config where k = 'secret';
  if base is null or secret is null then return new; end if;
  -- new alert for someone → phone notification
  if new.coll = 'inbox' and not new.deleted and tg_op = 'INSERT' then
    perform net.http_post(url := base || '/notify',
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  -- job moved to another stage in the app → move the Trello card
  if new.coll = 'sites' and not new.deleted and tg_op = 'UPDATE'
     and coalesce(new.data->>'stage','') <> coalesce(old.data->>'stage','')
     and coalesce(new.data->>'trello','') <> '' then
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $$;
drop trigger if exists records_change on public.records;
create trigger records_change after insert or update on public.records
for each row execute function public.on_record_change();

-- ===== meeting reminder on the phone 30 minutes before (runs every minute on the server) =====
-- Keys for the notify function also live in server_config: secret, vapid_public, vapid_private.
do $c$ begin create extension if not exists pg_cron; exception when others then null; end $c$;
create or replace function public.meeting_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare m record; who text; n int := 0; nowms bigint := (extract(epoch from now())*1000)::bigint; msg text; nid text;
begin
  for m in
    select r.id, r.data, s.data->>'name' as site
    from records r left join records s on s.coll='sites' and s.id = r.data->>'site' and not s.deleted
    where r.coll='meets' and not r.deleted
      and (r.data->>'at') ~ '^[0-9]+$'
      and (r.data->>'at')::bigint > nowms
      and (r.data->>'at')::bigint <= nowms + 30*60*1000
      and coalesce(r.data->>'ping15','') <> (r.data->>'at')
  loop
    msg := '⏰ ' || to_char(to_timestamp((m.data->>'at')::bigint/1000) at time zone 'America/New_York', 'FMHH12:MI AM')
           || ' (in ' || greatest(1, round(((m.data->>'at')::bigint - nowms)/60000.0))::int || ' min): ' || coalesce(m.data->>'title','Meeting')
           || coalesce(' — ' || m.site, '');
    for who in
      select distinct x from (
        select m.data->>'by' as x
        union select jsonb_array_elements_text(m.data->'with') where jsonb_typeof(m.data->'with') = 'array'
        union select id from records where not (m.data ? 'with') and coll='emps' and not deleted and data->>'role'='owner' and coalesce((data->>'inactive')::boolean,false)=false
      ) q where x is not null and x <> ''
    loop
      nid := 'n' || replace(gen_random_uuid()::text,'-','');
      insert into records (coll,id,data,deleted,updated_by,updated_at)
      values ('inbox', nid, jsonb_build_object('id',nid,'to',who,'msg',msg,'kind','info','ts',nowms,'read',false,'link',jsonb_build_object('tab','cal')), false, 'server', now());
      n := n + 1;
    end loop;
    update records set data = data || jsonb_build_object('ping15', m.data->>'at'), updated_at = now() where coll='meets' and id = m.id;
  end loop;
  return n;
end $$;
revoke all on function public.meeting_reminders() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname='meeting-reminders';
select cron.schedule('meeting-reminders', '* * * * *', 'select public.meeting_reminders()');

-- ===== put every job on the map + drive time from the office (edge function "geo"), every 3 minutes =====
select cron.unschedule(jobid) from cron.job where jobname='geo-jobs';
select cron.schedule('geo-jobs', '*/3 * * * *', $$select net.http_post(url:=(select v from server_config where k='functions_url')||'/geo', body:='{"max":15}'::jsonb, headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',(select v from server_config where k='secret')), timeout_milliseconds:=140000)$$);
-- far-away jobs (over 75 min drive) get flagged for the office to double-check the map point
select cron.unschedule(jobid) from cron.job where jobname='geo-sanity';
select cron.schedule('geo-sanity', '*/10 * * * *', $$update records set data = data || '{"geoCheck":true}'::jsonb, updated_at = now() where coll='sites' and not deleted and (data->'trip'->>'min')::numeric > 75 and not coalesce((data->>'fenceOk')::boolean,false) and not coalesce((data->>'geoCheck')::boolean,false)$$);

-- ===== tighter access: internal functions can't be called from outside; only signed-in team members save =====
revoke execute on function public._make_user(text,text) from public, anon, authenticated;
revoke execute on function public.on_record_change() from public, anon, authenticated;
revoke execute on function public.meeting_reminders() from public, anon, authenticated;
revoke execute on function public.admin_create_user(text,text) from public, anon;
revoke execute on function public.admin_set_password(text,text) from public, anon;
revoke execute on function public.save_records(jsonb) from public, anon;
revoke execute on function public.is_boss() from public, anon;
revoke execute on function public.my_emp() from public, anon;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.admin_create_user(text,text), public.admin_set_password(text,text), public.save_records(jsonb), public.is_boss(), public.my_emp(), public.is_member() to authenticated;
-- after the owner has signed up once, also run:  revoke execute on function public.setup_owner(text,text) from public, anon, authenticated;

-- ===== private files: photos, receipts, voice notes, videos open only for signed-in team members =====
-- (the app's helper adds the sign-in pass automatically; see sw.js)
update storage.buckets set public = false where id = 'files';
drop policy if exists "members only read files" on storage.objects;
create policy "members only read files" on storage.objects as restrictive for select to public
  using (bucket_id <> 'files' or (auth.uid() is not null and public.is_member()));

-- barcode → product lookups, saved so the same barcode is never looked up twice (only the "upc" function reads it)
create table if not exists public.upc_cache (code text primary key, data jsonb not null default '{}'::jsonb, ts timestamptz not null default now());
alter table public.upc_cache enable row level security;
revoke all on public.upc_cache from anon, authenticated;
-- ===== speed-ups + plain-value fix (applied Oct 2026) =====
-- save: never merge an object into a plain value (number / text / list) — that corrupted the office location
create or replace function public.save_records(rows jsonb)
 returns table(coll text, id text, data jsonb, deleted boolean)
 language plpgsql set search_path to 'public'
as $function$
#variable_conflict use_column
declare r jsonb; un text[];
begin
  for r in select * from jsonb_array_elements(rows) loop
    if coalesce((r->>'deleted')::boolean, false) then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'full', '{}'::jsonb), true, r->>'by', now())
      on conflict (coll, id) do update set data = coalesce(r->'full', '{}'::jsonb), deleted = true, updated_by = r->>'by', updated_at = now();
    elsif r ? 'full' then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', r->'full', false, r->>'by', now())
      on conflict (coll, id) do update set data = r->'full', deleted = false, updated_by = r->>'by', updated_at = now();
    else
      un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'patch', '{}'::jsonb), false, r->>'by', now())
      on conflict (coll, id) do update
        set data = case
              when t.deleted then coalesce(r->'patch', '{}'::jsonb)
              when jsonb_typeof(t.data) <> 'object' then t.data
              else (t.data || coalesce(r->'patch', '{}'::jsonb)) - un end,
            deleted = false, updated_by = r->>'by', updated_at = now();
    end if;
  end loop;
  return query select t.coll, t.id, t.data, t.deleted from public.records t
    join (select x->>'coll' as c, x->>'id' as i from jsonb_array_elements(rows) x) k on t.coll = k.c and t.id = k.i;
end $function$;

-- the change trigger checks first whether there is anything to do
create or replace function public.on_record_change()
 returns trigger language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
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
      body := jsonb_build_object('to', new.data->>'to', 'msg', new.data->>'msg'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  else
    perform net.http_post(url := base || '/trello',
      body := jsonb_build_object('card', new.data->>'trello', 'stage', new.data->>'stage', 'phase', new.data->>'phase'),
      headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret));
  end if;
  return new;
end $function$;

-- the team check runs once per request instead of once per row (~10x faster downloads)
alter policy "team can read" on public.records using ((select public.is_member()) and public.can_see(coll, data));
alter policy "team can update" on public.records using ((select public.is_member()) and public.can_see(coll, data)) with check ((select public.is_member()));
alter policy "team can write" on public.records with check ((select public.is_member()) and (coll <> 'keep' or data->>'owner' = (select public.my_emp()) or (select public.no_team_yet())));
create index if not exists records_emp_auth_idx on public.records ((data->>'authUid')) where coll = 'emps';

-- the map/drive-time job only calls the server when a job actually needs it
select cron.schedule('geo-jobs', '*/3 * * * *', $$select net.http_post(url:=(select v from server_config where k='functions_url')||'/geo', body:='{"max":15}'::jsonb, headers:=jsonb_build_object('Content-Type','application/json','x-push-secret',(select v from server_config where k='secret')), timeout_milliseconds:=140000)
 where exists (select 1 from records s where s.coll='sites' and not s.deleted and (
   (s.data->>'lat' is null and not coalesce((s.data->>'geoServer')::boolean,false) and coalesce(s.data->>'stage','') <> 'done')
   or (s.data->>'lat' is not null and exists (select 1 from records b where b.coll='base' and b.id='lat' and jsonb_typeof(b.data)='number')
       and (s.data->'trip' is null or not coalesce((s.data->'trip'->>'road')::boolean,false)
            or (s.data->'trip'->>'fromLat')::numeric is distinct from (select (b.data #>> '{}')::numeric from records b where b.coll='base' and b.id='lat')))))$$);

-- ===== who sees what (privacy between employees) =====
-- the signed-in person's own employee record, looked up once per request
create or replace function public.my_emp_data() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('id', id, 'role', data->>'role', 'title', data->>'title', 'all', coalesce((data->>'all')::boolean,false),
                   'lead', coalesce((data->>'lead')::boolean,false), 'crew', data->>'crew')
                   from public.records where coll = 'emps' and not deleted and data->>'authUid' = auth.uid()::text limit 1), '{}'::jsonb);
$$;
grant execute on function public.my_emp_data() to authenticated;
-- is the record's person in my crew (crew leaders see their own crew's time)
create or replace function public.in_my_crew(who text, crew text) returns boolean language sql stable security definer set search_path = public as $$
  select crew is not null and exists (select 1 from public.records e where e.coll = 'emps' and e.id = who and e.data->>'crew' = crew);
$$;
-- the rules:
--   hours, time off, sent-home, travel: your own; crew leaders also their crew; owner, managers and office everyone
--   receipts: your own; owner, managers, "all", Payroll and Bookkeeper everyone
--   notifications and phone-alert sign-ups: only your own
--   meetings: the owner, whoever made it, and whoever it is with
--   private notes: owner and the people it's shared with
--   everything else (jobs, schedule, material, people list): the whole team
create or replace function public.can_see2(c text, d jsonb, me jsonb) returns boolean language sql stable set search_path = public as $$
  select case
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
      or d->>'who' = me->>'id'
      or ((me->>'lead')::boolean and public.in_my_crew(d->>'who', me->>'crew'))
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper'))
      or d->>'who' = me->>'id'
    else true end;
$$;
alter policy "team can read" on public.records using ((select public.is_member()) and coalesce(public.can_see2(coll, data, (select public.my_emp_data())), false));
alter policy "team can update" on public.records using ((select public.is_member()) and coalesce(public.can_see2(coll, data, (select public.my_emp_data())), false)) with check ((select public.is_member()));

create or replace function public._row_exists(c text, i text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.records where coll = c and id = i);
$$;
revoke all on function public._row_exists(text, text) from public, anon;
grant execute on function public._row_exists(text, text) to authenticated;
-- saving skips a record the person isn't allowed to change (e.g. re-sending an alert addressed to someone else) instead of failing the whole save
create or replace function public.save_records(rows jsonb)
 returns table(coll text, id text, data jsonb, deleted boolean)
 language plpgsql set search_path to 'public'
as $function$
#variable_conflict use_column
declare r jsonb; un text[];
begin
  for r in select * from jsonb_array_elements(rows) loop
   begin
    if coalesce((r->>'deleted')::boolean, false) then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'full', '{}'::jsonb), true, r->>'by', now())
      on conflict (coll, id) do update set data = coalesce(r->'full', '{}'::jsonb), deleted = true, updated_by = r->>'by', updated_at = now();
    elsif r ? 'full' then
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', r->'full', false, r->>'by', now())
      on conflict (coll, id) do update set data = r->'full', deleted = false, updated_by = r->>'by', updated_at = now();
    else
      un := coalesce(array(select jsonb_array_elements_text(coalesce(r->'unset', '[]'::jsonb))), '{}'::text[]);
      insert into public.records as t (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'patch', '{}'::jsonb), false, r->>'by', now())
      on conflict (coll, id) do update
        set data = case
              when t.deleted then coalesce(r->'patch', '{}'::jsonb)
              when jsonb_typeof(t.data) <> 'object' then t.data
              else (t.data || coalesce(r->'patch', '{}'::jsonb)) - un end,
            deleted = false, updated_by = r->>'by', updated_at = now();
    end if;
   exception when insufficient_privilege then
    -- an existing row this person can't see (e.g. re-sending an alert addressed to someone else): skip it.
    -- a new row they may write but not read back (an alert for someone else): plain insert.
    if not public._row_exists(r->>'coll', r->>'id') then
      insert into public.records (coll, id, data, deleted, updated_by, updated_at)
      values (r->>'coll', r->>'id', coalesce(r->'full', r->'patch', '{}'::jsonb), coalesce((r->>'deleted')::boolean, false), r->>'by', now());
    end if;
   end;
  end loop;
  return query select t.coll, t.id, t.data, t.deleted from public.records t
    join (select x->>'coll' as c, x->>'id' as i from jsonb_array_elements(rows) x) k on t.coll = k.c and t.id = k.i;
end $function$;
-- ===== nobody can promote themselves or approve their own stuff (checked by the database on every save) =====
create or replace function public.guard_record() returns trigger language plpgsql security invoker set search_path = public as $$
declare me jsonb; boss boolean; office boolean; money boolean; o jsonb; n jsonb := new.data;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;   -- the server's own jobs
  -- a save of an existing record first arrives as an insert attempt; the update check that follows judges it
  if tg_op = 'INSERT' and public._row_exists(new.coll, new.id) then return new; end if;
  me := public.my_emp_data();
  if me = '{}'::jsonb then return new; end if;                   -- first-time setup (no team yet)
  boss := public.is_boss();
  if boss then return new; end if;
  office := me->>'role' = 'office';
  money := office and me->>'title' in ('Payroll','Bookkeeper');
  o := case when tg_op = 'UPDATE' then old.data else null end;
  if new.deleted then
    if new.coll = 'emps' then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;
  if new.coll = 'emps' then
    -- only the bosses add people or change role, crew, leader, access or sign-in; you may change your own language and phone
    if o is null or old.id <> me->>'id' or (n - 'lang' - 'phone') is distinct from (o - 'lang' - 'phone') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll in ('punches','timeoff','exps','travel','goHomeLog') then
    if new.coll = 'goHomeLog' and not office then raise exception 'not allowed' using errcode = '42501'; end if;
    -- you only make records for yourself
    if (o is null or o->>'who' is distinct from n->>'who') and n->>'who' is distinct from me->>'id' and not office then
      raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll = 'punches' and not office then
      -- you can't approve or move your own clock-in, or change a clock-out once it's there
      if coalesce(n->>'approvedBy','') <> coalesce(o->>'approvedBy','')
         or (o is not null and (n->>'in' is distinct from o->>'in'
              or (coalesce((o->>'pending')::boolean,false) and not coalesce((n->>'pending')::boolean,false))
              or (o->>'out' is not null and o->'out' <> 'null'::jsonb and n->'out' is distinct from o->'out')
              or n->'edits' is distinct from o->'edits'))
      then raise exception 'not allowed' using errcode = '42501'; end if;
    elsif new.coll = 'timeoff' then
      -- you can ask, not approve
      if coalesce(n->>'status','pending') not in ('pending','cancelled') and n->>'status' is distinct from o->>'status' then
        raise exception 'not allowed' using errcode = '42501'; end if;
    elsif new.coll = 'exps' and not money then
      -- only Payroll / Bookkeeper / bosses mark receipts paid
      if coalesce(n->>'paid','false') <> coalesce(o->>'paid','false') and coalesce((n->>'paid')::boolean,false)
         or n->>'paidBy' is distinct from o->>'paidBy' then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
  end if;
  return new;
end $$;


-- save: existing records are updated, new ones inserted (no upsert: an upsert must also pass the read rule
-- with only the changed fields, which made the privacy rule skip normal saves like a clock-out)
-- anything the person isn't allowed to write is skipped instead of failing the whole save
create or replace function public.save_records(rows jsonb)
 returns table(coll text, id text, data jsonb, deleted boolean)
 language plpgsql set search_path to 'public'
as $function$
#variable_conflict use_column
declare r jsonb; un text[]; ex boolean; c text; i text; del boolean; v jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    c := r->>'coll'; i := r->>'id'; del := coalesce((r->>'deleted')::boolean, false);
    begin
      ex := public._row_exists(c, i);
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
        if ex then
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
      when insufficient_privilege then null;   -- not allowed: skipped
      when unique_violation then              -- two phones created it at the same moment: merge into it
        update public.records as t set data = case when r ? 'full' or del then coalesce(r->'full','{}'::jsonb)
                                                    when jsonb_typeof(t.data) <> 'object' then t.data
                                                    else t.data || coalesce(r->'patch','{}'::jsonb) end,
               deleted = del, updated_by = r->>'by', updated_at = now()
          where t.coll = c and t.id = i;
    end;
    -- send back what is now saved (one exact lookup per record, so the read rule isn't checked against the whole table)
    return query select t.coll, t.id, t.data, t.deleted from public.records t where t.coll = c and t.id = i;
  end loop;
end $function$;
-- ===== security hardening (Oct 2026 audit) =====

-- 1) table permissions: the anonymous key gets nothing; signed-in users can read/insert/update through the rules,
--    never delete rows directly (deleting is a flag, kept in history) or truncate
revoke all on public.records from anon;
revoke truncate, trigger, references, delete on public.records from authenticated;
revoke all on public.server_config from anon, authenticated;

-- 2) helper functions: not callable without signing in
revoke execute on function public.in_my_crew(text, text) from public, anon;
revoke execute on function public.my_emp_data() from public, anon;
revoke execute on function public.can_see(text, jsonb) from public, anon;
revoke execute on function public.can_see2(text, jsonb, jsonb) from public, anon;
grant execute on function public.in_my_crew(text, text), public.my_emp_data(), public.can_see(text, jsonb), public.can_see2(text, jsonb, jsonb) to authenticated;

-- 3) who is "privileged": owner, managers, everyone-access, Payroll, Bookkeeper
create or replace function public.emp_privileged(d jsonb) returns boolean language sql immutable as $$
  select coalesce(d->>'role','') in ('owner','manager') or coalesce((d->>'all')::boolean,false)
      or (coalesce(d->>'role','') = 'office' and coalesce(d->>'title','') in ('Payroll','Bookkeeper'));
$$;
create or replace function public.emp_by_email(em text) returns jsonb language sql stable security definer set search_path = public as $$
  select data from public.records where coll = 'emps' and not deleted
    and (lower(data->>'authEmail') = lower(em) or data->>'authUid' = (select id::text from auth.users where lower(email) = lower(em) limit 1)) limit 1;
$$;
revoke execute on function public.emp_by_email(text) from public, anon, authenticated;
create or replace function public.i_am_owner() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_emp_data()->>'role','') = 'owner';
$$;
revoke execute on function public.i_am_owner() from public, anon;
grant execute on function public.i_am_owner() to authenticated;

-- 4) passwords: only the owner can set the password of a privileged person (so nobody can take over the owner's account)
create or replace function public.admin_set_password(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; target jsonb;
begin
  if not public.is_boss() then raise exception 'not allowed'; end if;
  target := public.emp_by_email(p_email);
  if not public.i_am_owner() and (target is null or public.emp_privileged(target)) then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email) returning id into uid;
  return uid;
end $$;
create or replace function public._make_user(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; em text := lower(trim(p_email)); target jsonb;
begin
  if not (public.is_boss() or public.no_team_yet()) then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  select id into uid from auth.users where lower(email) = em;
  if uid is not null then
    -- an existing sign-in: same rule as resetting a password
    target := public.emp_by_email(em);
    if not public.no_team_yet() and not public.i_am_owner() and (target is null or public.emp_privileged(target)) then raise exception 'not allowed'; end if;
    update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
    return uid;
  end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(p_pass, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;

-- 5) the change rules, checked by the database on every save (also for direct API requests)
create or replace function public.guard_record() returns trigger language plpgsql security invoker set search_path = public as $$
declare me jsonb; role text; owner_ boolean; boss boolean; office boolean; payroll boolean; money boolean; hours boolean; approver boolean;
        o jsonb; n jsonb := new.data; f text;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;   -- the server's own jobs
  if tg_op = 'INSERT' and public._row_exists(new.coll, new.id) then return new; end if;               -- judged by the update that follows
  me := public.my_emp_data();
  if me = '{}'::jsonb then return new; end if;                                                          -- first-time setup
  role := coalesce(me->>'role','');
  owner_ := role = 'owner';
  if owner_ then return new; end if;
  boss := public.is_boss();                                   -- managers, everyone-access, Payroll
  office := role = 'office';
  payroll := office and me->>'title' = 'Payroll';
  money := coalesce((me->>'all')::boolean,false) or (office and me->>'title' in ('Payroll','Bookkeeper'));
  hours := coalesce((me->>'all')::boolean,false) or payroll;                      -- may edit anyone's clock times
  approver := role in ('manager','office') or coalesce((me->>'all')::boolean,false);   -- may approve an out-of-fence clock-in
  o := case when tg_op = 'UPDATE' then old.data else null end;

  if new.coll = 'emps' then
    -- only the owner adds or changes privileged people (owner, manager, everyone-access, Payroll, Bookkeeper)
    if boss then
      if public.emp_privileged(n) or (o is not null and public.emp_privileged(o)) then
        if not (o is not null and old.id = me->>'id' and not new.deleted and (n - 'lang' - 'phone') = (o - 'lang' - 'phone')) then
          raise exception 'only the owner can change this person' using errcode = '42501'; end if;
      end if;
      return new;
    end if;
    -- everyone else: only your own language and phone
    if new.deleted or o is null or old.id <> me->>'id' or (n - 'lang' - 'phone') is distinct from (o - 'lang' - 'phone') then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;

  if new.coll = 'jobs' then
    -- a task says who sent it, and chat messages say who wrote them: nobody can sign as someone else
    if not boss and ((o is null and coalesce(n->>'from', me->>'id') <> me->>'id') or (o is not null and n->>'from' is distinct from o->>'from')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    for f in select k from jsonb_object_keys(n) k where k like 'm\_%' loop
      if (o is null or o->f is distinct from n->f) and n->f->>'by' is distinct from me->>'id'
         and not (o ? f and ((n->f) - 'seen' - 'got') = ((o->f) - 'seen' - 'got')) then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end loop;
    return new;
  end if;
  if new.coll = 'meets' then
    -- only whoever made a meeting changes it (and makes it in his own name)
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
    -- removing hours, receipts or time off: only who may edit them
    if new.coll = 'punches' and not hours then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll = 'exps' and not money and (o->>'who' is distinct from me->>'id' or coalesce((o->>'paid')::boolean,false)) then raise exception 'not allowed' using errcode = '42501'; end if;
    if new.coll in ('timeoff','travel') and not boss and o->>'who' is distinct from me->>'id' then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;

  -- records are made for yourself (Payroll / everyone-access may enter hours for others)
  if (o is null or o->>'who' is distinct from n->>'who') and n->>'who' is distinct from me->>'id'
     and not (new.coll = 'punches' and hours) and not (new.coll = 'exps' and money) then
    raise exception 'not allowed' using errcode = '42501'; end if;

  if new.coll = 'punches' and not hours then
    -- approving an out-of-fence clock-in: managers / office only, and only that
    if coalesce(n->>'approvedBy','') <> coalesce(o->>'approvedBy','')
       or (coalesce((o->>'pending')::boolean,false) and not coalesce((n->>'pending')::boolean,false)) then
      if not approver or o is null or n->>'approvedBy' is distinct from me->>'id' and coalesce(n->>'approvedBy','') <> '' then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
    if o is not null then
      if n->>'in' is distinct from o->>'in' or n->'edits' is distinct from o->'edits' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      -- a clock-out, once there, stays (except an approver rejecting the clock-in)
      if o->'out' is not null and o->'out' <> 'null'::jsonb and n->'out' is distinct from o->'out' then
        raise exception 'clock times can only be changed by Payroll' using errcode = '42501'; end if;
      -- clocking out someone else: approvers only (sent home / rejected)
      if (o->'out' is null or o->'out' = 'null'::jsonb) and n->'out' is not null and n->'out' <> 'null'::jsonb
         and o->>'who' is distinct from me->>'id' and not approver then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
  elsif new.coll = 'timeoff' then
    if n->>'status' is distinct from coalesce(o->>'status', n->>'status') or (o is null and coalesce(n->>'status','pending') <> 'pending') then
      -- approving / denying: owner, managers, everyone-access, Payroll; the person may cancel his own
      if not (role = 'manager' or boss) and not (n->>'status' = 'cancelled' and o->>'who' = me->>'id') then
        raise exception 'not allowed' using errcode = '42501'; end if;
    end if;
  elsif new.coll = 'exps' and not money then
    -- paying back: Payroll / Bookkeeper / everyone-access; a paid receipt can't be changed afterwards
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and not boss then
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'amt' is distinct from o->>'amt') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $$;

-- 6) every save is stamped with who really made it (not what the phone claims); ids and the fields that hold ids
--    (who, site, to, crew, reply-to...) can't contain quotes or angle brackets, so they can't smuggle code into the screens
create or replace function public.stamp_record() returns trigger language plpgsql security invoker set search_path = public as $$
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
  if current_user in ('authenticated','anon') and auth.uid() is not null then
    me := public.my_emp_data();
    new.updated_by := coalesce(me->>'id', 'uid:' || auth.uid()::text);
    new.updated_at := now();
  end if;
  return new;
end $$;
create or replace trigger records_stamp before insert or update on public.records for each row execute function public.stamp_record();
create or replace trigger records_guard before insert or update on public.records
  for each row when (new.coll in ('emps','punches','timeoff','exps','travel','goHomeLog','jobs','meets')) execute function public.guard_record();

-- 7) history: every change, who made it, before and after (only readable by the server / owner via the dashboard)
create table if not exists public.records_history (
  hid bigserial primary key, at timestamptz not null default now(), coll text not null, id text not null,
  op text not null, by_who text, old_data jsonb, new_data jsonb, old_deleted boolean, new_deleted boolean);
alter table public.records_history enable row level security;
revoke all on public.records_history from anon, authenticated;
create index if not exists records_history_rec on public.records_history (coll, id, at desc);
create index if not exists records_history_at on public.records_history (at);
create or replace function public.log_record() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data and new.deleted = old.deleted then return null; end if;
  insert into public.records_history (coll, id, op, by_who, old_data, new_data, old_deleted, new_deleted)
  values (new.coll, new.id, lower(tg_op), new.updated_by,
          case when tg_op = 'UPDATE' then old.data end, new.data,
          case when tg_op = 'UPDATE' then old.deleted end, new.deleted);
  return null;
end $$;
revoke execute on function public.log_record() from public, anon, authenticated;
create or replace trigger records_log after insert or update on public.records for each row execute function public.log_record();

-- 8) daily copy of everything: 14 rotating copies (today's overwrites the one from two weeks ago)
create table if not exists public.records_backup (slot int not null, day date not null, coll text not null, id text not null, data jsonb, deleted boolean, updated_by text, updated_at timestamptz, primary key (slot, coll, id));
alter table public.records_backup enable row level security;
revoke all on public.records_backup from anon, authenticated;
create or replace function public.backup_records() returns int language plpgsql security definer set search_path = public as $$
declare n int; s int := (current_date - date '2026-01-01') % 14;
begin
  insert into public.records_backup (slot, day, coll, id, data, deleted, updated_by, updated_at)
    select s, current_date, coll, id, data, deleted, updated_by, updated_at from public.records
  on conflict (slot, coll, id) do update set day = excluded.day, data = excluded.data, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.backup_records() from public, anon, authenticated;
select cron.schedule('daily-backup', '7 7 * * *', $$select public.backup_records()$$);

-- 9) files: photos of receipts / hours / private notes open only for people who may see that record;
--    nobody overwrites someone else's file; size and type limits
create or replace function public.file_ok(path text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when split_part(path,'/',1) in ('exps','punches','timeoff','keep','travel','inbox') then
      exists (select 1 from public.records r where r.coll = split_part(path,'/',1) and r.id = split_part(path,'/',2)
              and coalesce(public.can_see2(r.coll, r.data, public.my_emp_data()), false))
    else true end;
$$;
revoke execute on function public.file_ok(text) from public, anon;
grant execute on function public.file_ok(text) to authenticated;
drop policy if exists "files: only who may see the record" on storage.objects;
create policy "files: only who may see the record" on storage.objects as restrictive for select to public
  using (bucket_id <> 'files' or owner_id = auth.uid()::text or public.file_ok(name));
drop policy if exists "files: only your own can be replaced" on storage.objects;
create policy "files: only your own can be replaced" on storage.objects as restrictive for update to public
  using (bucket_id <> 'files' or owner_id = auth.uid()::text or (select public.i_am_owner()));
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/*','audio/*','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/vnd.dwg','application/acad','application/x-dwg','application/octet-stream','text/plain']
  where id = 'files';

-- ===== speed (load test): read rule inlined, crew leaders' crew looked up once per request =====
-- the signed-in person, looked up once per request; crew leaders also get their crew's ids (so the read rule needs no per-row lookup)
create or replace function public.my_emp_data() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('id', r.id, 'role', r.data->>'role', 'title', r.data->>'title', 'all', coalesce((r.data->>'all')::boolean,false),
                   'lead', coalesce((r.data->>'lead')::boolean,false), 'crew', r.data->>'crew',
                   'crew_ids', case when coalesce((r.data->>'lead')::boolean,false) and r.data->>'crew' is not null then
                       (select coalesce(jsonb_agg(e.id), '[]'::jsonb) from public.records e where e.coll = 'emps' and not e.deleted and e.data->>'crew' = r.data->>'crew')
                     else '[]'::jsonb end)
                   from public.records r where r.coll = 'emps' and not r.deleted and r.data->>'authUid' = auth.uid()::text limit 1), '{}'::jsonb);
$$;
-- the read rule, written so the database can inline it (no per-row function call): same rules as before
create or replace function public.can_see2(c text, d jsonb, me jsonb) returns boolean language sql stable as $$
  select case
    when c not in ('keep','inbox','push','meets','punches','timeoff','goHomeLog','travel','exps') then true
    when c = 'keep' then d->>'owner' = me->>'id' or coalesce(d->'collab','[]'::jsonb) ? (me->>'id')
    when c = 'inbox' then d->>'to' = me->>'id'
    when c = 'push' then d->>'who' = me->>'id'
    when c = 'meets' then me->>'role' = 'owner' or d->>'by' = me->>'id' or coalesce(d->'with','[]'::jsonb) ? (me->>'id')
    when c in ('punches','timeoff','goHomeLog','travel') then
         me->>'role' in ('owner','manager','office') or (me->>'all')::boolean
      or d->>'who' = me->>'id'
      or coalesce(me->'crew_ids','[]'::jsonb) ? (d->>'who')
    when c = 'exps' then
         me->>'role' in ('owner','manager') or (me->>'all')::boolean
      or (me->>'role' = 'office' and me->>'title' in ('Payroll','Bookkeeper'))
      or d->>'who' = me->>'id'
    else true end;
$$;

alter function public.emp_privileged(jsonb) set search_path = pg_catalog;
revoke execute on function public.in_my_crew(text, text) from authenticated;

-- ===== change rules v3 (after the independent check) =====
create or replace function public._num(x text) returns numeric language sql immutable set search_path = pg_catalog as $$
  select case when x ~ '^-?[0-9]+(\.[0-9]+)?$' then x::numeric end;
$$;
-- the sign-in being reset or re-created belongs to a privileged person? (checks every employee record tied to that sign-in,
-- by sign-in id and by email, so a look-alike record can't hide the real one)
create or replace function public.signin_privileged(em text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.records r where r.coll = 'emps' and not r.deleted and public.emp_privileged(r.data)
                 and (lower(r.data->>'authEmail') = lower(em)
                      or r.data->>'authUid' = (select id::text from auth.users where lower(email) = lower(em) limit 1)));
$$;
revoke execute on function public.signin_privileged(text) from public, anon, authenticated;
create or replace function public.admin_set_password(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not public.is_boss() then raise exception 'not allowed'; end if;
  if not public.i_am_owner() and (public.signin_privileged(p_email) or public.emp_by_email(p_email) is null) then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), updated_at = now()
  where lower(email) = lower(p_email) returning id into uid;
  return uid;
end $$;
create or replace function public._make_user(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid; em text := lower(trim(p_email));
begin
  if not (public.is_boss() or public.no_team_yet()) then raise exception 'not allowed'; end if;
  perform public._pw_check(p_pass);
  select id into uid from auth.users where lower(email) = em;
  if uid is not null then
    if not public.no_team_yet() and not public.i_am_owner() and (public.signin_privileged(em) or public.emp_by_email(em) is null) then raise exception 'not allowed'; end if;
    update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = uid;
    return uid;
  end if;
  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change,
                          email_change_token_current, reauthentication_token, phone_change, phone_change_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(p_pass, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '', '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;
-- the owner is set up: the first-time setup call is closed for good
revoke execute on function public.setup_owner(text, text) from public, anon, authenticated;
revoke execute on function public.emp_privileged(jsonb) from public, anon;
grant execute on function public.emp_privileged(jsonb) to authenticated;

create or replace function public.guard_record() returns trigger language plpgsql security invoker set search_path = public as $$
declare me jsonb; role text; boss boolean; office boolean; payroll boolean; money boolean; hours boolean; approver boolean; material boolean;
        o jsonb; n jsonb := new.data; f text; nowms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if current_user not in ('authenticated','anon') or auth.uid() is null then return new; end if;   -- the server's own jobs
  if tg_op = 'INSERT' and public._row_exists(new.coll, new.id) then return new; end if;               -- judged by the update that follows
  me := public.my_emp_data();
  if me = '{}'::jsonb then return new; end if;                                                          -- first-time setup
  role := coalesce(me->>'role','');
  o := case when tg_op = 'UPDATE' then old.data else null end;

  -- for everyone, owner included: alerts carry their real sender; phone-alert sign-ups are your own
  if new.coll = 'inbox' and tg_op = 'INSERT' and jsonb_typeof(n) = 'object' then
    new.data := n || jsonb_build_object('from', me->>'id'); n := new.data; end if;
  if new.coll = 'push' and ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and o->>'who' is distinct from me->>'id')
                            or (not new.deleted and n->>'who' is distinct from me->>'id')) then
    raise exception 'not allowed' using errcode = '42501'; end if;
  -- the office's employee records: unique sign-in per person (no look-alike records)
  if new.coll = 'emps' and not new.deleted and (
       (n ? 'authUid' and n->>'authUid' is distinct from o->>'authUid' and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and x.data->>'authUid' = n->>'authUid'))
    or (n ? 'authEmail' and lower(n->>'authEmail') is distinct from lower(o->>'authEmail') and exists (select 1 from public.records x where x.coll='emps' and not x.deleted and x.id <> new.id and lower(x.data->>'authEmail') = lower(n->>'authEmail')))) then
    raise exception 'that sign-in already belongs to someone' using errcode = '42501'; end if;

  if role = 'owner' then return new; end if;
  boss := public.is_boss();                                   -- managers, everyone-access, Payroll
  office := role = 'office';
  payroll := office and me->>'title' = 'Payroll';
  material := office and me->>'title' = 'Material';
  money := coalesce((me->>'all')::boolean,false) or (office and me->>'title' in ('Payroll','Bookkeeper'));
  hours := coalesce((me->>'all')::boolean,false) or payroll;
  approver := role in ('manager','office') or coalesce((me->>'all')::boolean,false);

  if new.coll = 'emps' then
    -- only the owner adds or changes privileged or office people (owner, manager, everyone-access, any office title)
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

  -- company settings: office location, crews, schedule, app settings — managers / everyone-access / Payroll only
  if new.coll in ('base','crews','sched','_') then
    if not boss then raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;

  if new.coll = 'sites' then
    -- the fence (where you may clock in) and the drive time (travel pay) and removing a job: office and up
    if not (boss or office) and (new.deleted
         or n->'lat' is distinct from o->'lat' or n->'lng' is distinct from o->'lng' or n->'rad' is distinct from o->'rad'
         or n->'fenceOk' is distinct from o->'fenceOk' or n->'trip' is distinct from o->'trip') then
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
    -- only the note's owner can hand it to someone else
    if o is not null and o->>'owner' is distinct from me->>'id' and (n->>'owner' is distinct from o->>'owner' or new.deleted) then
      raise exception 'not allowed' using errcode = '42501'; end if;
    return new;
  end if;

  if new.coll = 'jobs' then
    -- a task says who sent it, and chat messages say who wrote them: nobody signs as someone else
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

  -- records belong to one person: made for yourself, and never moved to someone else
  -- (Payroll / everyone-access for hours, Payroll / Bookkeeper for receipts, managers for time off and travel)
  if ((o is null and n->>'who' is distinct from me->>'id') or (o is not null and n->>'who' is distinct from o->>'who'))
     and not (new.coll = 'punches' and hours) and not (new.coll = 'exps' and money) and not (new.coll in ('timeoff','travel') and boss) then
    raise exception 'not allowed' using errcode = '42501'; end if;

  if new.coll = 'punches' and not hours then
    -- a new clock-in can't be in the future or more than 3 days back (offline phones catch up), a clock-out not before it
    if o is null and (public._num(n->>'in') is null or public._num(n->>'in') > nowms + 300000 or public._num(n->>'in') < nowms - 3*86400000
                      or (n->'out' is not null and n->'out' <> 'null'::jsonb and (public._num(n->>'out') < public._num(n->>'in') or public._num(n->>'out') > nowms + 300000))) then
      raise exception 'clock time out of range' using errcode = '42501'; end if;
    -- approving an out-of-fence clock-in: managers / office, never your own
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
  elsif new.coll = 'timeoff' and not boss then
    -- you can ask (or cancel your own); approving is for owner, managers, everyone-access, Payroll;
    -- the dates of an answered request don't change
    if (o is null and coalesce(n->>'status','pending') <> 'pending')
       or (o is not null and n->>'status' is distinct from o->>'status' and n->>'status' <> 'cancelled')
       or (o is not null and coalesce(o->>'status','pending') <> 'pending' and (n - 'status' - 'seen' - 'read') is distinct from (o - 'status' - 'seen' - 'read')) then
      raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'exps' and not money then
    if coalesce((n->>'paid')::boolean,false) and not coalesce((o->>'paid')::boolean,false) then raise exception 'not allowed' using errcode = '42501'; end if;
    if n->>'paidBy' is distinct from o->>'paidBy' or n->>'paidAt' is distinct from o->>'paidAt' then raise exception 'not allowed' using errcode = '42501'; end if;
    if coalesce((o->>'paid')::boolean,false) and (n - 'seen' - 'read') is distinct from (o - 'seen' - 'read') then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif new.coll = 'travel' and not boss then
    if o is not null and (n->>'status' is distinct from o->>'status' or n->>'minutes' is distinct from o->>'minutes' or n->>'pay' is distinct from o->>'pay' or n->>'miles' is distinct from o->>'miles') then
      raise exception 'not allowed' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create or replace trigger records_guard before insert or update on public.records
  for each row when (new.coll in ('emps','punches','timeoff','exps','travel','goHomeLog','jobs','meets','inbox','push','base','crews','sched','_','sites','stock','mats','keep'))
  execute function public.guard_record();
