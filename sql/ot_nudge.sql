-- Baruch 11/19: two OwnTracks reminders for everyone on the automatic clock (appClock + OwnTracks connected):
--  (1) 8:00 AM on a workday (Mon–Fri, Sunday only if he is booked, never Saturday / a day off): "make sure OwnTracks is open"
--  (2) on the clock and NO new location from his phone for 1 hour during the workday (8–7, Fri 8–1:15, or while kept late):
--      "open OwnTracks once" — one message per quiet stretch (a new reading resets it). Uses the phone's newest READING
--      (last_tst), not just the last contact, so a phone with stuck GPS (Shauly 11/19) is caught too.
create or replace function private.ot_nudge_tick(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public, private as $f$
declare loc timestamp := p_now at time zone 'America/New_York'; d text := to_char(p_now at time zone 'America/New_York','YYYY-MM-DD');
  dow int := extract(dow from (p_now at time zone 'America/New_York'))::int; hm int; endm int; nowms bigint := (extract(epoch from p_now)*1000)::bigint;
  st jsonb; done jsonb; q jsonb; r record; n1 int := 0; n2 int := 0; newest bigint; inms bigint; late boolean;
begin
  hm := extract(hour from loc)::int * 60 + extract(minute from loc)::int; endm := case when dow = 5 then 13*60+15 else 19*60 end;
  if dow = 6 or private.day_off(d) then return jsonb_build_object('skip','no work today'); end if;
  select v::jsonb into st from server_config where k = 'ot_nudge';
  if st is null or st->>'day' is distinct from d then st := jsonb_build_object('day', d, 'morning', '[]'::jsonb, 'quiet', '{}'::jsonb); end if;
  done := st->'morning'; q := st->'quiet';
  for r in select e.id, e.data->>'crew' crew, t.last_tst, t.last_at from records e join private.ot_tokens t on t.who = e.id and t.accepted_at is not null
           where e.coll = 'emps' and not e.deleted and coalesce((e.data->>'appClock')::boolean,false) and coalesce(e.data->>'clock','') <> 'false'
             and not coalesce((e.data->>'inactive')::boolean,false) loop
    -- (1) morning
    if hm >= 8*60 and hm < 8*60+30 and not done ? r.id and (dow <> 0 or private.man_sched_site(r.id, r.crew, d) is not null) then
      perform private.notify_now(r.id, '🛰 Good morning — make sure OwnTracks is open and leave it open all day. Do not swipe it closed.',
        '🛰 Buenos días — asegúrese de que OwnTracks esté abierto y déjelo abierto todo el día. No lo cierre deslizando hacia arriba.', 'info', jsonb_build_object('tab','punch'), null);
      done := done || to_jsonb(r.id); n1 := n1 + 1;
    end if;
    -- (2) on the clock and no new reading for 1 hour
    select public._num(p.data->>'in') into inms from records p where p.coll='punches' and not p.deleted and p.data->>'who' = r.id
      and coalesce(p.data->>'src','') <> 'fingercheck' and coalesce(p.data->'out','null'::jsonb) = 'null'::jsonb and p.data->>'voided' is null
      and coalesce(p.data->>'rejected','') <> 'true' and to_char(to_timestamp(public._num(p.data->>'in')/1000.0) at time zone 'America/New_York','YYYY-MM-DD') = d
      order by public._num(p.data->>'in') desc limit 1;
    if inms is null then continue; end if;
    late := private.kept_late(r.id, d);
    if not ((hm >= 8*60 and hm < endm) or late) then continue; end if;
    newest := greatest(coalesce(r.last_tst, 0), inms);                       -- quiet since his newest reading, or since he punched in
    if nowms - newest >= 3600000 and coalesce((q->>r.id)::bigint, 0) <> newest then
      perform private.notify_now(r.id, '🛰 OwnTracks has not sent your location for 1 hour. Open OwnTracks once and leave it open (do not swipe it closed).',
        '🛰 OwnTracks no ha mandado su ubicación en 1 hora. Abra OwnTracks una vez y déjelo abierto (no lo cierre deslizando hacia arriba).', 'warn', jsonb_build_object('tab','punch'), null);
      q := q || jsonb_build_object(r.id, newest); n2 := n2 + 1;
    end if;
  end loop;
  st := jsonb_build_object('day', d, 'morning', done, 'quiet', q);
  insert into server_config(k, v) values ('ot_nudge', st::text) on conflict (k) do update set v = excluded.v;
  return jsonb_build_object('morning', n1, 'quiet', n2);
end $f$;
revoke all on function private.ot_nudge_tick(timestamptz) from public, anon, authenticated;
-- every 5 minutes
select cron.schedule('ot-nudge', '*/5 * * * *', 'select private.ot_nudge_tick()');
