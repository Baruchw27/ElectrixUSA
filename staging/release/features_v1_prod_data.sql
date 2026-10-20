-- Features v1 — production data change (NOT run; only after Baruch approves the production release).
-- Sets "Time Clock Required = NO" for the six monthly-paid people. Nothing else on their records changes;
-- their old punches stay; no pay information is stored. Run once; safe to run twice.
-- Production ids (read from the live team list on 20 Oct 2026):
--   u2 Yossi (site manager) · o1 Shia (Payroll, all access) · o2 Menachem (Material) — Baruch confirmed 20 Oct: "Nachum" = Menachem
--   u3 Shauly (site manager) · o3 Miriam (Payroll) · b1 Solomon (Bookkeeper)
begin;
select id, data->>'name' as name, data->>'role' as role, data->>'title' as title, data->'clock' as clock_before
from records where coll = 'emps' and id in ('u2','o1','o2','u3','o3','b1') order by id;
update records set data = data || '{"clock":false}'::jsonb, updated_at = now(), updated_by = 'release-features-v1'
where coll = 'emps' and not deleted and id in ('u2','o1','o2','u3','o3','b1')
  and data->>'name' in ('Yossi','Shia','Menachem','Shauly','Miriam','Solomon');   -- refuses if an id no longer belongs to that person
select id, data->>'name' as name, data->'clock' as clock_after from records where coll = 'emps' and id in ('u2','o1','o2','u3','o3','b1') order by id;
-- expect 6 rows with clock_after = false; if not, ROLLBACK and check the ids
commit;
