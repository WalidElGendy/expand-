-- ==========================================================================
-- Applied 2026-10-25 to project ookiupgocavjbxcxquwl.
-- Designers can delete uploaded designs.
--
-- A 2D or 3D designer can delete their own team's design files (anyone's
-- upload in that team, not only their own); planners, leads of other
-- departments, managers and admins can delete either. When the last design
-- for a team is deleted, that team's stage goes back from done to
-- in_progress. The project's status is left alone.
-- ==========================================================================

create or replace function can_manage_design(p_team text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_design() and (coalesce(my_dept(), '') not in ('2d','3d') or my_dept() = p_team)
$$;

-- Storage objects carry no purpose of their own, so the check goes through
-- the files row (which still exists: the app removes the object first).
create or replace function can_delete_design_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from files f
                 where f.bucket = p_bucket and f.path = p_name and f.purpose = 'design'
                   and can_manage_design(f.department_id))
$$;

create policy file_delete_design on files for delete
  using (purpose = 'design' and can_manage_design(department_id));

create policy "storage delete design" on storage.objects for delete
  using (bucket_id = 'docs' and can_delete_design_object(bucket_id, name));

create or replace function design_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.purpose <> 'design' or old.project_id is null or old.department_id not in ('2d','3d') then return old; end if;
  if not exists (select 1 from files where project_id = old.project_id and purpose = 'design' and department_id = old.department_id) then
    update project_stages set status = 'in_progress', completed_at = null
     where project_id = old.project_id and department_id = old.department_id and status = 'done';
  end if;
  return old;
end $$;

create trigger t_design_removed after delete on files
  for each row execute function design_removed();

revoke execute on function can_manage_design(text), can_delete_design_object(text, text), design_removed() from public, anon;
