-- Baruch 11/16: job costs from QuickBooks (materials, subcontractors, tools/other — no payroll), one record per job in
-- coll 'qbexp' (id 'qb_<site>', data {site, src, from, to, lines:[{d,t,n,v,a,m,c,amt,q}]}). Seen and written only by the
-- owner and Payroll, like the Fingercheck paychecks (fcpay). Loaded by Claude from the QuickBooks report; a new report
-- replaces the records.
do $$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.can_see2(text,jsonb,jsonb)'::regprocedure);
  if position('''qbexp''' in d) > 0 then return; end if;
  d2 := replace(d, '''rates'',''fcpay'') then true', '''rates'',''fcpay'',''qbexp'') then true');
  if d2 = d then raise exception 'can_see2: collection list not found'; end if;
  d := d2;
  d2 := replace(d, $q$when c in ('rates','fcpay') then$q$, $q$when c in ('rates','fcpay','qbexp') then$q$);
  if d2 = d then raise exception 'can_see2: rates/fcpay branch not found'; end if;
  execute d2;
end $$;
drop trigger if exists records_guard_qbexp on public.records;
create trigger records_guard_qbexp before insert or update on public.records for each row when (new.coll = 'qbexp') execute function public.guard_fcpay();
