-- Baruch 11/11 (plan approved; goes live only after he approves the preview)
-- Hourly Fingercheck import: the function itself decides by New York time —
--   8 AM–9 PM: today's punches, both companies;  6 AM: the last 7 days again;  other hours: nothing.
-- Read-only toward Fingercheck. Switch: server_config fc_auto ('on' / 'off'). Floor: fc_auto_from (paid weeks stay as they are).
insert into server_config(k,v) values ('fc_auto','on'),('fc_auto_from','2026-11-01')
  on conflict (k) do update set v = excluded.v;
select cron.schedule('fc-auto-import', '17 * * * *', $$
  select net.http_post(
    url := (select v from server_config where k='functions_url')||'/fingercheck',
    body := '{"action":"auto"}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret',(select v from server_config where k='secret')),
    timeout_milliseconds := 120000)
$$);
