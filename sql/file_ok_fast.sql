-- 11/14 (Baruch, speed): opening a photo/file made the server read through every record (~0.15 s each time).
-- Only a handful of records ever hold uploaded files, so a small index now finds those first. Same answer, same rule.
create index if not exists records_has_media_idx on public.records (coll) where not deleted and strpos(data::text, '/files/media/') > 0;
create or replace function public.file_ok(path text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case
    when path like 'media/%' then
      exists (select 1 from public.records r where not r.deleted and strpos(r.data::text, '/files/media/') > 0
              and strpos(r.data::text, '/files/' || path) > 0
              and coalesce(public.can_see2(r.coll, r.data, public.my_emp_data()), false))
    -- Trello photos copied into the job folder live under trello/<job id>/…: whoever may see that job may see them
    when path like 'trello/%' and split_part(path,'/',2) <> '' then
      exists (select 1 from public.records r where r.coll = 'sites' and r.id = split_part(path,'/',2) and not r.deleted
              and coalesce(public.can_see2(r.coll, r.data, public.my_emp_data()), false))
    when split_part(path,'/',2) <> '' then
      exists (select 1 from public.records r where r.coll = split_part(path,'/',1) and r.id = split_part(path,'/',2) and not r.deleted
              and coalesce(public.can_see2(r.coll, r.data, public.my_emp_data()), false))
    else false end;
$function$;
