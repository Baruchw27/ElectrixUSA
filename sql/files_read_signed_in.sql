-- Baruch 11/10: the 'files' read grant covers only signed-in users (it was "public"). The narrower RESTRICTIVE rules
-- ("members only read files" + "files: only who may see the record") still apply on top, unchanged.
-- Applied on staging and live 11/10; before/after: every team member sees the same files, outsiders see none.
create policy "signed-in team reads files" on storage.objects as permissive for select to authenticated using (bucket_id = 'files');
drop policy "public reads files" on storage.objects;
