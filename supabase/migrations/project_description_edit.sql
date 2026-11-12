-- ==========================================================================
-- Applied 2026-11-12 to project ookiupgocavjbxcxquwl.
-- The project description can be edited after the project is submitted.
--
-- proj_update only lets planners (admins, managers, PM) change a project, but
-- the person who submitted it or owns it should be able to fix its own brief
-- too. A security-definer function lets them change the description and
-- nothing else, and every edit is written to the project history.
-- ==========================================================================

create or replace function set_project_description(p_project uuid, p_description text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old text;
  v_new text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select description into v_old from projects
   where id = p_project
     and (can_plan() or created_by = my_profile_id() or owner_id = my_profile_id());
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_new is distinct from v_old then
    update projects set description = v_new where id = p_project;
    insert into project_events (project_id, kind, body, created_by)
    values (p_project, 'note', 'Description edited', my_profile_id());
  end if;
end $$;

revoke execute on function set_project_description(uuid, text) from public, anon;
grant execute on function set_project_description(uuid, text) to authenticated;
