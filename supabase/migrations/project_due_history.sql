-- ==========================================================================
-- Applied 2026-10-25 to project ookiupgocavjbxcxquwl.
-- The due date can be amended at any time from the project page (planners,
-- leads, managers, admins — the existing proj_update policy). Every change
-- is written to the project history: "Due date changed: A → B".
-- ==========================================================================

create or replace function project_due_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.due_on is distinct from old.due_on and auth.uid() is not null then
    insert into project_events (project_id, kind, body, created_by)
    values (new.id, 'note',
            'Due date changed: ' || coalesce(to_char(old.due_on, 'DD Mon YYYY'), 'none') || ' → ' || coalesce(to_char(new.due_on, 'DD Mon YYYY'), 'none'),
            my_profile_id());
  end if;
  return new;
end $$;

create trigger t_project_due_changed after update of due_on on projects
  for each row execute function project_due_changed();

revoke execute on function project_due_changed() from public, anon, authenticated;
