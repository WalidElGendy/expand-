-- ==========================================================================
-- Applied 2026-10-21 to project ookiupgocavjbxcxquwl.
-- "+ Add documents" on every project page.
--
-- Any active colleague can upload documents (purpose 'document') to a
-- project, as themselves. Extra permissive policies: file_insert and
-- "storage write docs" are left exactly as they were.
-- ==========================================================================

create policy file_insert_project_doc on files for insert
  with check (purpose = 'document' and project_id is not null
              and is_active_user() and uploaded_by = my_profile_id());

create policy "storage write project docs" on storage.objects for insert
  with check (bucket_id = 'docs' and is_active_user());
