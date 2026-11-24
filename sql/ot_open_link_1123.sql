-- Baruch 11/23: "the second you open the notification, it drives you straight to OwnTracks" — the 8 AM "Good morning — make
-- sure OwnTracks is open" and the 1-hour "OwnTracks has not sent your location" messages carry link {tab:'punch', ot:true};
-- the app (staging/p27.js) then opens OwnTracks right away (button as backup). Patched into private.ot_nudge_tick.
do $$ declare d0 text; d2 text; a text := $a$'warn', jsonb_build_object('tab','punch'), null);$a$; m text := $m$'info', jsonb_build_object('tab','punch'), null);$m$;
begin
  d0 := pg_get_functiondef('private.ot_nudge_tick(timestamptz)'::regprocedure);
  if position($o$'ot',true$o$ in d0) > 0 then return; end if;
  if (length(d0) - length(replace(d0, m, ''))) / length(m) <> 1 then raise exception 'morning message not found once'; end if;
  if (length(d0) - length(replace(d0, a, ''))) / length(a) <> 1 then raise exception 'quiet message not found once'; end if;
  d2 := replace(replace(d0, m, $n$'info', jsonb_build_object('tab','punch','ot',true), null);$n$), a, $q$'warn', jsonb_build_object('tab','punch','ot',true), null);$q$);
  execute d2;
end $$;
