-- Baruch 11/11: automatic time clock through the free OwnTracks phone app. The phone watches the man's job areas by itself
-- (even with every app closed) and tells the "owntracks" Edge Function when he arrives at / leaves an Electrix job.
-- Only arrive/leave at Electrix jobs is kept; every other location the phone sends is thrown away.
create extension if not exists pgcrypto;
create table if not exists private.ot_tokens (
  who text primary key, token text not null, created_at timestamptz not null default now(),
  last_at timestamptz, last_kind text, wp_hash text, accepted_at timestamptz);
create table if not exists private.ot_events (
  id bigserial primary key, who text not null, at timestamptz not null, kind text not null, site text, note text,
  created_at timestamptz not null default now());
create index if not exists ot_events_who_at on private.ot_events (who, at);

-- the signed-in person: his own OwnTracks login (made once). He must accept the notice first (accept=true).
create or replace function public.ot_setup(accept boolean default false) returns jsonb
language plpgsql security definer set search_path = public, private, extensions as $f$
declare me jsonb := public.my_emp_data(); w text := me->>'id'; r private.ot_tokens;
begin
  if w is null then raise exception 'not signed in'; end if;
  select * into r from private.ot_tokens where who = w;
  if not found then
    if not accept then return jsonb_build_object('who', w, 'on', false, 'accepted', false); end if;
    insert into private.ot_tokens(who, token, accepted_at) values (w, encode(gen_random_bytes(18), 'hex'), now()) returning * into r;
  elsif accept and r.accepted_at is null then update private.ot_tokens set accepted_at = now() where who = w returning * into r; end if;
  return jsonb_build_object('who', w, 'token', r.token, 'accepted', r.accepted_at is not null, 'last', r.last_at, 'lastKind', r.last_kind,
    'url', (select v from server_config where k = 'functions_url') || '/owntracks');
end $f$;
revoke all on function public.ot_setup(boolean) from public, anon; grant execute on function public.ot_setup(boolean) to authenticated;

-- owner / Payroll: who has it on, and the arrive/leave events of one day
create or replace function public.ot_report(p_day text) returns jsonb
language plpgsql security definer set search_path = public, private as $f$
declare me jsonb := public.my_emp_data();
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'only the owner or Payroll'; end if;
  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'last', last_at, 'accepted', accepted_at)) from private.ot_tokens), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('who', who, 'at', (extract(epoch from at)*1000)::bigint, 'kind', kind, 'site', site, 'note', note) order by at)
      from private.ot_events where to_char(at at time zone 'America/New_York','YYYY-MM-DD') = p_day), '[]'::jsonb));
end $f$;
revoke all on function public.ot_report(text) from public, anon; grant execute on function public.ot_report(text) to authenticated;

-- server only (the Edge Function, service role)
create or replace function public.ot_check(p_who text, p_token text) returns jsonb
language plpgsql security definer set search_path = public, private as $f$
declare r private.ot_tokens;
begin
  select * into r from private.ot_tokens where who = p_who;
  if not found or r.token <> p_token or r.accepted_at is null then return jsonb_build_object('ok', false); end if;
  update private.ot_tokens set last_at = now() where who = p_who;
  return jsonb_build_object('ok', true, 'wp', r.wp_hash);
end $f$;
create or replace function public.ot_note(p_who text, p_kind text, p_site text, p_at bigint, p_note text, p_wp text) returns void
language plpgsql security definer set search_path = public, private as $f$
begin
  if p_kind is not null then
    insert into private.ot_events(who, at, kind, site, note) values (p_who, to_timestamp(p_at/1000.0), p_kind, p_site, left(p_note, 300));
    update private.ot_tokens set last_kind = p_kind where who = p_who; end if;
  if p_wp is not null then update private.ot_tokens set wp_hash = p_wp where who = p_who; end if;
end $f$;
revoke all on function public.ot_check(text,text), public.ot_note(text,text,text,bigint,text,text) from public, anon, authenticated;
grant execute on function public.ot_check(text,text), public.ot_note(text,text,text,bigint,text,text) to service_role;

-- 11/11 (Baruch): a switch only after 5 minutes at the new job — arrivals wait here; leaving that job before clears it
create table if not exists private.ot_pending (who text primary key, site text not null, at bigint not null, lat double precision, lng double precision);
create or replace function public.ot_pend(p_who text, p_site text, p_at bigint, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path = public, private as $f$
begin
  if p_at is null then delete from private.ot_pending where who = p_who and site = p_site;
  else insert into private.ot_pending(who, site, at, lat, lng) values (p_who, p_site, p_at, p_lat, p_lng)
       on conflict (who) do update set site = excluded.site, at = case when private.ot_pending.site = excluded.site then least(private.ot_pending.at, excluded.at) else excluded.at end,
         lat = excluded.lat, lng = excluded.lng; end if;
end $f$;
create or replace function public.ot_due(p_before bigint) returns jsonb
language plpgsql security definer set search_path = public, private as $f$
declare r jsonb;
begin
  with d as (delete from private.ot_pending where at <= p_before returning who, site, at, lat, lng)
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into r from d;
  return r;
end $f$;
revoke all on function public.ot_pend(text,text,bigint,double precision,double precision), public.ot_due(bigint) from public, anon, authenticated;
grant execute on function public.ot_pend(text,text,bigint,double precision,double precision), public.ot_due(bigint) to service_role;
-- the 1-minute timer (live only after Baruch approves):
-- select cron.schedule('ot-tick', '* * * * *', $$ select net.http_post(url := (select v from server_config where k='functions_url')||'/owntracks',
--   body := '{"tick":true}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-push-secret',(select v from server_config where k='secret'))) $$);
