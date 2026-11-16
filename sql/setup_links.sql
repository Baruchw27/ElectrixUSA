-- Baruch 11/15: "send them the app on email, and they should set up a password for themselves".
-- A personal one-time link (7 days) lets a field worker choose his own password. Only workers (never owner/office/managers).
-- The code itself is never stored — only its sha256. Making a link: owner or Payroll (or the server for Claude).
create table if not exists private.setup_links(
  code_hash text primary key, who text not null, made_by text, made_at timestamptz not null default now(),
  expires_at timestamptz not null, used_at timestamptz);
revoke all on private.setup_links from public, anon, authenticated;

create or replace function private.setup_link_new(p_who text, p_by text) returns text
language plpgsql security definer set search_path to 'public','extensions' as $f$
declare e jsonb; code text;
begin
  select data into e from public.records where coll='emps' and id=p_who and not deleted;
  if e is null or coalesce((e->>'inactive')::boolean,false) then raise exception 'no such person'; end if;
  if coalesce(e->>'role','') <> 'worker' then raise exception 'links are only for field workers'; end if;
  code := translate(encode(gen_random_bytes(18),'base64'),'+/=','-_');
  update private.setup_links set expires_at = least(expires_at, now()) where who=p_who and used_at is null;  -- one live link at a time
  insert into private.setup_links(code_hash, who, made_by, expires_at) values (encode(digest(code,'sha256'),'hex'), p_who, p_by, now() + interval '7 days');
  return code;
end $f$;
revoke all on function private.setup_link_new(text,text) from public, anon, authenticated;

create or replace function public.setup_link_make(p_who text) returns text
language plpgsql security definer set search_path to 'public' as $f$
declare me jsonb := public.my_emp_data();
begin
  if not (me->>'role' = 'owner' or (me->>'role' = 'office' and me->>'title' = 'Payroll')) then raise exception 'not allowed'; end if;
  return private.setup_link_new(p_who, me->>'id');
end $f$;
revoke all on function public.setup_link_make(text) from public, anon; grant execute on function public.setup_link_make(text) to authenticated;

-- who the link is for (first name + language) — nothing else
create or replace function public.setup_link_info(p_code text) returns jsonb
language plpgsql security definer set search_path to 'public','extensions' as $f$
declare l record; e jsonb;
begin
  select * into l from private.setup_links where code_hash = encode(digest(coalesce(p_code,''),'sha256'),'hex');
  if l is null then return jsonb_build_object('ok',false,'why','bad'); end if;
  if l.used_at is not null then return jsonb_build_object('ok',false,'why','used'); end if;
  if l.expires_at < now() then return jsonb_build_object('ok',false,'why','old'); end if;
  select data into e from public.records where coll='emps' and id=l.who and not deleted;
  return jsonb_build_object('ok',true,'first',split_part(coalesce(e->>'name',''),' ',1),'lang',coalesce(e->>'lang','es'));
end $f$;
grant execute on function public.setup_link_info(text) to anon, authenticated;

-- set the password; the link works once
create or replace function public.setup_link_use(p_code text, p_pass text) returns jsonb
language plpgsql security definer set search_path to 'public','auth','extensions' as $f$
declare l record; e jsonb; uid uuid;
begin
  select * into l from private.setup_links where code_hash = encode(digest(coalesce(p_code,''),'sha256'),'hex') for update;
  if l is null or l.used_at is not null or l.expires_at < now() then raise exception 'link not valid'; end if;
  select data into e from public.records where coll='emps' and id=l.who and not deleted;
  if e is null or coalesce(e->>'role','') <> 'worker' or coalesce((e->>'inactive')::boolean,false) then raise exception 'link not valid'; end if;
  perform public._pw_check(p_pass);
  update auth.users set encrypted_password = crypt(p_pass, gen_salt('bf')), updated_at = now()
   where (e->>'authUid' is not null and id = (e->>'authUid')::uuid) or (e->>'authUid' is null and lower(email) = lower(l.who || '@electrixusa.app'))
   returning id into uid;
  if uid is null then raise exception 'no sign-in for this person yet'; end if;
  update private.setup_links set used_at = now() where code_hash = l.code_hash;
  return jsonb_build_object('ok',true,'name',e->>'name');
end $f$;
grant execute on function public.setup_link_use(text,text) to anon, authenticated;
