-- Baruch 11/23 (Luis Guala 8:15 PM): "maybe we missed something" — a tracker reading that changed nothing left no trace, so we
-- could not tell whether he was still at the job or the reading was too rough. Now every location reading leaves one line:
-- NOT where he was (no position is kept), only: how far from the job he was clocked in at (and that job's fence), the nearest
-- job in the app and how far, how sure the phone was (accuracy, meters), and what the server did with it. Kept 14 days.
create table if not exists private.ot_reads (
  who text not null, at timestamptz not null, acc int, open_site text, open_m int, open_fence int,
  near_site text, near_m int, note text, got_at timestamptz not null default now());
create index if not exists ot_reads_who_at on private.ot_reads (who, at desc);
alter table private.ot_reads enable row level security;
revoke all on private.ot_reads from public, anon, authenticated;

create or replace function public.ot_read(p_who text, p_at bigint, p_acc int, p_open text, p_open_m int, p_open_fence int,
  p_near text, p_near_m int, p_note text) returns void
language plpgsql security definer set search_path to 'public', 'private' as $f$
begin
  insert into private.ot_reads(who, at, acc, open_site, open_m, open_fence, near_site, near_m, note)
  values (p_who, to_timestamp(p_at/1000.0), p_acc, p_open, p_open_m, p_open_fence, p_near, p_near_m, left(p_note, 200));
  if random() < 0.02 then delete from private.ot_reads where at < now() - interval '14 days'; end if;   -- keep 14 days
end $f$;
revoke all on function public.ot_read(text,bigint,int,text,int,int,text,int,text) from public, anon, authenticated;
grant execute on function public.ot_read(text,bigint,int,text,int,int,text,int,text) to service_role;
