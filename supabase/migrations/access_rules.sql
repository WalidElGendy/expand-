-- ==========================================================================
-- Applied 2026-10-30 to project ookiupgocavjbxcxquwl.
-- Who sees what, as of this change:
--
--   Work       everyone: any active user can create a project (with its
--              stages, people and RFP / reference files) and use Tenders
--              fully — read, create, edit, send for decision. Deciding a
--              tender stays with the approvers (tender_decide()).
--   Etimad     the Tenders department and admins only.
--   People     admins only (unchanged, enforced by the admin functions).
--   HR         admins and the HR department (the page no longer offers a
--              team view to supervisors; manager approvals stay on My HR).
-- ==========================================================================

-- ---------------------------------------------------------------- projects
-- A project this person created in the last day: lets a non-planner finish
-- the New project form (stages, people, files) without gaining the right to
-- edit everybody else's projects.
create or replace function created_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from projects where id = p and created_by = my_profile_id()
                 and created_at > now() - interval '1 day')
$$;

alter policy proj_insert on projects
  with check (can_plan() or (is_active_user() and created_by = my_profile_id()));
alter policy stage_plan on project_stages
  with check (can_plan() or created_project(project_id));
alter policy sm_insert on stage_members
  with check (can_staff_stage(stage_id)
              or created_project((select s.project_id from project_stages s where s.id = stage_id)));
alter policy file_insert on files
  with check (((purpose = any (array['rfp'::file_purpose, 'reference'::file_purpose])) and (can_plan() or created_project(project_id)))
    or ((purpose = 'document'::file_purpose) and (can_plan() or (my_dept() = 'content'::text) or (my_role() = any (array['lead'::app_role, 'manager'::app_role, 'admin'::app_role]))))
    or ((purpose = any (array['procurement'::file_purpose, 'production'::file_purpose])) and can_edit_production()));
alter policy "storage write intake" on storage.objects
  with check ((bucket_id = any (array['rfps'::text, 'refs'::text])) and is_active_user());

-- ----------------------------------------------------------------- tenders
-- Every active user works tenders as an analyst does; approving is still
-- the approvers' alone (tender_approver() is unchanged).
create or replace function tender_analyst() returns boolean
language sql stable security definer set search_path = public as $$
  select is_active_user()
$$;

-- ------------------------------------------------------------------ etimad
create or replace function etimad_access() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce(my_dept() = 'tenders', false)
$$;

alter policy ets_read on etimad_settings using (etimad_access());
alter policy ets_write on etimad_settings using (etimad_access()) with check (etimad_access());
alter policy ett_read on etimad_tenders using (etimad_access());
alter policy ett_update on etimad_tenders using (etimad_access()) with check (etimad_access());
alter policy eta_read on etimad_analyses using (etimad_access());
alter policy etc_read on etimad_contacts using (etimad_access());
alter policy etf_read on etimad_files using (etimad_access());
alter policy etf_insert on etimad_files with check (etimad_access());
alter policy etf_delete on etimad_files using (etimad_access());
alter policy etu_read on etimad_usage using (etimad_access());
alter policy "etimad read" on storage.objects using (bucket_id = 'etimad' and etimad_access());
alter policy "etimad write" on storage.objects with check (bucket_id = 'etimad' and etimad_access());
alter policy "etimad delete" on storage.objects using (bucket_id = 'etimad' and etimad_access());
