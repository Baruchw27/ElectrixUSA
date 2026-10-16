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

-- the office can set / reset someone's password
-- returns the sign-in's id so the employee record can be tied to it
drop function if exists public.admin_set_password(text, text);
create or replace function public.admin_set_password(p_email text, p_pass text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not public.is_boss() then raise exception 'not allowed'; end if;
  if length(p_pass) < 6 then raise exception 'password too short'; end if;
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
  if length(p_pass) < 6 then raise exception 'password too short'; end if;
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

-- ===== meeting reminder on the phone 15 minutes before (runs every minute on the server) =====
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
      and (r.data->>'at')::bigint <= nowms + 15*60*1000
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
create policy "members only read files" on storage.objects as restrictive for select to public
  using (bucket_id <> 'files' or (auth.uid() is not null and public.is_member()));
