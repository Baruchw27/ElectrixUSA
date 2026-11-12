-- 11/12: every employee row on the server always carries its sign-in name (authEmail).
-- Phones add it to each employee when they compare; a row without it (workers brought in from Fingercheck,
-- people with no sign-in yet) looked "changed" forever, so every office phone re-saved them every few minutes
-- (Shia's "still need to save 13"). The server now fills it in itself, same rule as the app: email if set, else id@electrixusa.app.
create or replace function private.emp_authemail() returns trigger
language plpgsql as $f$
begin
  if new.coll = 'emps' and not new.deleted and jsonb_typeof(new.data) = 'object' and coalesce(new.data->>'authEmail', '') = '' then
    new.data := new.data || jsonb_build_object('authEmail',
      lower(case when new.data->>'email' ~ '@' then new.data->>'email' else new.id || '@electrixusa.app' end));
  end if;
  return new;
end $f$;
drop trigger if exists a0_emp_authemail on public.records;
create trigger a0_emp_authemail before insert or update on public.records
  for each row when (new.coll = 'emps') execute function private.emp_authemail();
