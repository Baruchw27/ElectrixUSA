-- Baruch 11/9: fast plans without paying for storage we don't need.
-- A PRIVATE bucket for (1) short-term copies of recently opened plan PDFs — capped at 150 MB in total, the least recently
-- used are removed first, the original always stays on Trello — and (2) small first-page previews + thumbnails.
-- No storage policies are added: only the server (trello-files) can read or write it; phones get 1-hour links from it,
-- after the same permission check as opening the plan.
create schema if not exists private;
insert into storage.buckets (id, name, public, file_size_limit)
values ('plancache', 'plancache', false, 26214400)
on conflict (id) do nothing;

create table if not exists private.plan_cache (
  tid text primary key,
  bytes bigint not null default 0,
  hit_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace function public.plancache_put(p_tid text, p_bytes bigint)
returns void language sql security definer set search_path to 'public' as $f$
  insert into private.plan_cache (tid, bytes) values (p_tid, p_bytes)
  on conflict (tid) do update set bytes = excluded.bytes, hit_at = now();
$f$;

create or replace function public.plancache_hit(p_tid text)
returns void language sql security definer set search_path to 'public' as $f$
  update private.plan_cache set hit_at = now() where tid = p_tid;
$f$;

-- which kept copies to remove so the total stays under the cap (least recently opened first)
create or replace function public.plancache_over(p_cap bigint)
returns table (tid text) language sql security definer set search_path to 'public' as $f$
  select tid from (
    select tid, sum(bytes) over (order by hit_at desc, tid) as running from private.plan_cache
  ) x where running > p_cap;
$f$;

create or replace function public.plancache_forget(p_tids text[])
returns void language sql security definer set search_path to 'public' as $f$
  delete from private.plan_cache where tid = any(p_tids);
$f$;

-- which of these plans have a kept copy / preview / thumbnail (names like pdf/<tid>.pdf, pv/<tid>.jpg, th/<tid>.jpg)
create or replace function public.plancache_have(p_tids text[])
returns table (name text) language sql security definer set search_path to 'public', 'storage' as $f$
  select o.name from storage.objects o
  where o.bucket_id = 'plancache'
    and o.name = any (select unnest(array['pdf/' || t || '.pdf', 'pv/' || t || '.jpg', 'th/' || t || '.jpg']) from unnest(p_tids) t);
$f$;

revoke all on function public.plancache_put(text, bigint), public.plancache_hit(text), public.plancache_over(bigint),
  public.plancache_forget(text[]), public.plancache_have(text[]) from public, anon, authenticated;
grant execute on function public.plancache_put(text, bigint), public.plancache_hit(text), public.plancache_over(bigint),
  public.plancache_forget(text[]), public.plancache_have(text[]) to service_role;
