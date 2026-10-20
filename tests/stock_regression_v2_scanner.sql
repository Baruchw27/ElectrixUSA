-- Scanner V2 additions (STAGING, rolled back): brand-new item counted by two phones, duplicate send, box counts
begin;
do $$
declare r jsonb; q numeric;
  W1 text := '{"sub":"5466c837-786c-4e44-8d7e-831214c2decf","role":"authenticated"}';
  W2 text := '{"sub":"a0d94ae0-1996-4ed0-810b-3c20c09de2a2","role":"authenticated"}';
begin
  -- phone 1 puts back 2 boxes of 10 of a brand-new item (id comes from the barcode, same on both phones)
  perform set_config('request.jwt.claims',W1,true); execute 'set local role authenticated';
  r := apply_stock_txn('{"id":"v2t_a","kind":"in","moves":[{"id":"s_bcV2REGTEST","name":"Leviton 5603-P2W","unit":"pc","delta":20}]}'::jsonb);
  execute 'reset role';
  -- phone 2 puts back 1 single of the same new item
  perform set_config('request.jwt.claims',W2,true); execute 'set local role authenticated';
  r := apply_stock_txn('{"id":"v2t_b","kind":"in","moves":[{"id":"s_bcV2REGTEST","name":"Leviton 5603-P2W","unit":"pc","delta":1}]}'::jsonb);
  -- phone 2's weak signal re-sends the same transaction: must not count twice
  r := apply_stock_txn('{"id":"v2t_b","kind":"in","moves":[{"id":"s_bcV2REGTEST","name":"Leviton 5603-P2W","unit":"pc","delta":1}]}'::jsonb);
  if not (r->>'duplicate')::boolean then raise exception 'FAIL resend not detected as duplicate'; end if;
  execute 'reset role';
  select (data->>'qty')::numeric into q from records where coll='stock' and id='s_bcV2REGTEST';
  if q <> 21 then raise exception 'FAIL expected 21, got %', q; end if;
  if (select count(*) from records where coll='stock' and id='s_bcV2REGTEST') <> 1 then raise exception 'FAIL duplicate item rows'; end if;
  -- taking out more than is there is refused, nothing changes
  perform set_config('request.jwt.claims',W1,true); execute 'set local role authenticated';
  begin r := apply_stock_txn('{"id":"v2t_c","kind":"out","site":"s1","moves":[{"id":"s_bcV2REGTEST","delta":-30}]}'::jsonb); raise exception 'FAIL shortage allowed';
  exception when others then if sqlerrm not like 'insufficient_stock%' then raise; end if; end;
  execute 'reset role';
  select (data->>'qty')::numeric into q from records where coll='stock' and id='s_bcV2REGTEST';
  if q <> 21 then raise exception 'FAIL qty changed after refused pickup: %', q; end if;
  -- count version: goes up once per applied change, never on a duplicate, and a phone cannot write it
  if (select (data->>'qv')::int from records where coll='stock' and id='s_bcV2REGTEST') <> 2 then raise exception 'FAIL qv expected 2'; end if;
  perform set_config('request.jwt.claims',W1,true); execute 'set local role authenticated';
  update records set data = data || '{"qty":500,"qv":999,"note":"x"}'::jsonb where coll='stock' and id='s_bcV2REGTEST';
  execute 'reset role';
  if (select (data->>'qty')::int*1000+(data->>'qv')::int from records where coll='stock' and id='s_bcV2REGTEST') <> 21002 then raise exception 'FAIL phone changed qty/qv directly'; end if;
  raise notice 'V2 SCANNER STOCK CHECKS PASSED';
end $$;
select 'V2 SCANNER STOCK CHECKS PASSED' as result;
rollback;
