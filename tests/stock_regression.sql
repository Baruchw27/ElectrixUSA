-- ============================================================================
-- Electrix USA — Stock traceability regression suite (STAGING)
-- Run inside a transaction; every check RAISEs on failure. Rolls back at the end
-- so it never changes data. Each assertion maps to a requirement in the spec.
--   psql "$STAGING_URL" -f tests/stock_regression.sql
-- Accounts used (staging test data): OWNER u1, WORKER u7.
-- ============================================================================
begin;
do $$
declare v_id text; r jsonb; cur numeric; ok boolean; msg text; lg jsonb;
  OWNER  text := '{"sub":"49706be4-8266-41a1-9b62-e527046f82cb","role":"authenticated"}';
  WORKER text := '{"sub":"5466c837-786c-4e44-8d7e-831214c2decf","role":"authenticated"}';
  procedure_failed text := '';
begin
  select id into v_id from records where coll='stock' and not deleted limit 1;

  -- helper assert
  -- (inline; raises on mismatch)

  -- 1) set baseline 100 (owner) + audit written atomically
  perform set_config('request.jwt.claims',OWNER,true); execute 'set local role authenticated';
  r := apply_stock_txn(jsonb_build_object('id','rt_set','kind','set','ts',1,'moves',jsonb_build_array(jsonb_build_object('id',v_id,'set',100,'expect',(select data->>'qty' from records where coll='stock' and id=v_id)))));
  if (select data->>'qty' from records where coll='stock' and id=v_id) <> '100' then raise exception 'FAIL set baseline'; end if;
  if not exists (select 1 from records where coll='stockLog' and id='rt_set' and (data->>'auth')='true') then raise exception 'FAIL audit not written'; end if;
  execute 'reset role';

  -- 2) worker pickup 30 → qty 70; audit by=worker (NOT the client-sent by), before=100 after=70
  perform set_config('request.jwt.claims',WORKER,true); execute 'set local role authenticated';
  r := apply_stock_txn(jsonb_build_object('id','rt_take','kind','out','ts',2,'site','s1','by','u1','moves',jsonb_build_array(jsonb_build_object('id',v_id,'delta',-30))));
  execute 'reset role';
  select data into lg from records where coll='stockLog' and id='rt_take';
  if (select data->>'qty' from records where coll='stock' and id=v_id) <> '70' then raise exception 'FAIL pickup qty'; end if;
  if lg->>'by' <> 'u7' then raise exception 'FAIL impersonation: by=%',lg->>'by'; end if;
  if (lg->'items'->0->>'before') <> '100' or (lg->'items'->0->>'after') <> '70' then raise exception 'FAIL before/after'; end if;
  if (lg->>'ts') <> '2' then raise exception 'FAIL original ts not preserved'; end if;
  if (lg->>'serverTs') is null then raise exception 'FAIL serverTs missing'; end if;

  -- 3) shortage REJECTED (no floor, no false success, no audit, no claim)
  perform set_config('request.jwt.claims',WORKER,true); execute 'set local role authenticated';
  begin r := apply_stock_txn(jsonb_build_object('id','rt_short','kind','out','ts',3,'moves',jsonb_build_array(jsonb_build_object('id',v_id,'delta',-200)))); ok:=true; exception when others then ok:=false; end;
  execute 'reset role';
  if ok then raise exception 'FAIL shortage not rejected'; end if;
  if (select data->>'qty' from records where coll='stock' and id=v_id) <> '70' then raise exception 'FAIL shortage changed qty'; end if;
  if exists(select 1 from records where coll='stockLog' and id='rt_short') then raise exception 'FAIL shortage wrote audit'; end if;
  if exists(select 1 from stock_applied where id='rt_short') then raise exception 'FAIL shortage claimed id'; end if;

  -- 4) idempotency: same id + same content → no double; different content → rejected
  perform set_config('request.jwt.claims',WORKER,true); execute 'set local role authenticated';
  r := apply_stock_txn(jsonb_build_object('id','rt_take','kind','out','ts',2,'site','s1','by','u1','moves',jsonb_build_array(jsonb_build_object('id',v_id,'delta',-30))));
  if (r->>'duplicate') <> 'true' then raise exception 'FAIL idempotent retry'; end if;
  if (select data->>'qty' from records where coll='stock' and id=v_id) <> '70' then raise exception 'FAIL retry double-applied'; end if;
  begin r := apply_stock_txn(jsonb_build_object('id','rt_take','kind','out','ts',2,'moves',jsonb_build_array(jsonb_build_object('id',v_id,'delta',-5)))); ok:=true; exception when others then ok:=false; end;
  execute 'reset role';
  if ok then raise exception 'FAIL reuse-with-different-content not rejected'; end if;

  -- 5) manual adjust authorization: worker blocked
  perform set_config('request.jwt.claims',WORKER,true); execute 'set local role authenticated';
  begin r := apply_stock_txn(jsonb_build_object('id','rt_wadj','kind','set','moves',jsonb_build_array(jsonb_build_object('id',v_id,'set',500)))); ok:=true; exception when others then ok:=false; end;
  execute 'reset role';
  if ok then raise exception 'FAIL worker manual adjust not blocked'; end if;

  -- 6) manual count optimistic concurrency: stale expect rejected
  perform set_config('request.jwt.claims',OWNER,true); execute 'set local role authenticated';
  begin r := apply_stock_txn(jsonb_build_object('id','rt_stale','kind','set','moves',jsonb_build_array(jsonb_build_object('id',v_id,'set',80,'expect',999)))); ok:=true; exception when others then ok:=false; end;
  execute 'reset role';
  if ok then raise exception 'FAIL stale manual count not rejected'; end if;

  -- 7) reconciliation: in-sync item reports ok
  if (select status from stock_reconcile() where id=v_id) <> 'ok' then raise exception 'FAIL reconcile in-sync'; end if;

  raise notice 'ALL STOCK REGRESSION CHECKS PASSED';
end $$;
rollback;

-- Tamper-proofing (separate transaction so the RPC flag cannot leak):
-- as WORKER, INSERT/UPDATE/soft-delete of coll='stockLog' must all raise 42501 (see tests report).
