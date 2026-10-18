-- Minimal Supabase look-alike so schema.sql can be tested on plain Postgres
do $$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon nologin; create role authenticated nologin; end if; end $$;
grant usage on schema public to anon, authenticated;
create schema auth; create schema storage; create schema extensions; create schema net;
grant usage on schema auth, storage, net to anon, authenticated;
create table auth.users(instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz, confirmation_token text, recovery_token text, email_change_token_new text, email_change text, email_change_token_current text default '', reauthentication_token text default '', phone_change text default '', phone_change_token text default '');
create table auth.identities(id uuid primary key, user_id uuid, provider_id text not null, identity_data jsonb not null, provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
create table storage.buckets(id text primary key, name text, public boolean);
create table storage.objects(id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
create table net.calls(id serial, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb) returns bigint language sql as $$ insert into net.calls(url,body,headers) values (url,body,headers) returning id::bigint $$;
grant all on net.calls to authenticated; grant usage on sequence net.calls_id_seq to authenticated;
create extension pgcrypto;
-- pg_cron stand-in (jobs are only recorded, never run)
create schema if not exists cron;
create table if not exists cron.job(jobid serial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values (n,s,c) on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command returning jobid::bigint $$;
create or replace function cron.unschedule(id bigint) returns boolean language sql as $$ delete from cron.job where jobid=id returning true $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
create or replace function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language sql as $$ insert into net.calls(url,body,headers) values (url,body,headers) returning id::bigint $$;
alter table storage.objects add column if not exists owner_id text;
alter table storage.buckets add column if not exists file_size_limit bigint, add column if not exists allowed_mime_types text[];
grant select, insert, update, delete on storage.objects to authenticated, anon; grant usage on sequence storage.objects_id_seq to authenticated, anon;
insert into storage.buckets(id,name,public) values ('files','files',true) on conflict do nothing;
