-- ==========================================================================
-- Applied 2026-11-05 to project ookiupgocavjbxcxquwl.
-- Project files can be deleted from the project page.
--
-- Besides the uploader and admins (file_delete), the team that owns each
-- list can remove files from it:
--   · Documents (rfp, reference, document): planners  (can_plan)
--   · Pricing sheets (pricing):               the pricing team (can_price)
--   · Procurement / production files:         production (can_edit_production)
-- Designs keep their own rule (design_delete.sql).
-- ==========================================================================

create or replace function can_delete_project_file(p_purpose file_purpose, p_uploaded_by uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_active_user() and (
       p_uploaded_by = my_profile_id() or is_admin()
    or (p_purpose in ('rfp', 'reference', 'document') and can_plan())
    or (p_purpose = 'pricing' and can_price())
    or (p_purpose in ('procurement', 'production') and can_edit_production()))
$$;

-- Storage objects carry no purpose of their own, so the check goes through the
-- files row (which still exists: the app removes the object first).
create or replace function can_delete_project_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from files f
                 where f.bucket = p_bucket and f.path = p_name and f.project_id is not null
                   and f.purpose <> 'design'
                   and can_delete_project_file(f.purpose, f.uploaded_by))
$$;

create policy file_delete_project on files for delete
  using (project_id is not null and purpose <> 'design' and can_delete_project_file(purpose, uploaded_by));

create policy "storage delete project files" on storage.objects for delete
  using (bucket_id in ('docs', 'rfps', 'refs') and can_delete_project_object(bucket_id, name));

revoke execute on function can_delete_project_file(file_purpose, uuid), can_delete_project_object(text, text) from public, anon;
grant execute on function can_delete_project_file(file_purpose, uuid), can_delete_project_object(text, text) to authenticated;
