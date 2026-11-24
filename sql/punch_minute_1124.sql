-- Baruch 11/24: clock times are kept to the whole minute, like Fingercheck (the push already sends HH:MM:00).
-- So the app's hours and pay match Fingercheck exactly. Fires BEFORE records_guard_punch (trigger names run in
-- alphabetical order), so the guard always compares minute-times: a phone that still holds 8:00:40 and saves
-- the clock-out is not seen as "changing the clock-in" (the stored row already says 8:00).
-- Only data.in and data.out of punches change. Tracker times (seen, away, trips) keep their seconds.
create or replace function private.punch_minute() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if jsonb_typeof(new.data) <> 'object' then return new; end if;
  if jsonb_typeof(new.data->'in') = 'number' and (new.data->>'in')::numeric % 60000 <> 0 then
    new.data := jsonb_set(new.data, '{in}', to_jsonb(floor((new.data->>'in')::numeric / 60000) * 60000)); end if;
  if jsonb_typeof(new.data->'out') = 'number' and (new.data->>'out')::numeric % 60000 <> 0 then
    new.data := jsonb_set(new.data, '{out}', to_jsonb(floor((new.data->>'out')::numeric / 60000) * 60000)); end if;
  return new;
end $$;

drop trigger if exists records_ab_punch_minute on public.records;
create trigger records_ab_punch_minute before insert or update on public.records
  for each row when (new.coll = 'punches') execute function private.punch_minute();

-- the clocks already saved with seconds (an update runs the trigger above)
update public.records set data = data
 where coll = 'punches' and not deleted
   and ((jsonb_typeof(data->'in') = 'number' and (data->>'in')::numeric % 60000 <> 0)
     or (jsonb_typeof(data->'out') = 'number' and (data->>'out')::numeric % 60000 <> 0));
