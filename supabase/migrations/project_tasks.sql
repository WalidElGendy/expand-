-- ==========================================================================
-- Applied 2026-10-20 to project ookiupgocavjbxcxquwl.
-- Tasks on the project page.
--
-- Any active colleague can add a task to a project and assign it to anyone
-- on the team. The assignee (and planners, leads, managers, admins — the
-- original task policies) can tick it off; the person who added it can edit
-- or remove it. Adding, completing and reassigning are written to the
-- project History. Extra permissive policies: the original task_* policies
-- are left exactly as they were.
-- ==========================================================================

create policy task_insert_project on tasks for insert
  with check (is_active_user() and project_id is not null and created_by = my_profile_id());

create policy task_update_creator on tasks for update
  using (is_active_user() and created_by = my_profile_id())
  with check (is_active_user() and created_by = my_profile_id());

create policy task_delete_creator on tasks for delete
  using (is_active_user() and created_by = my_profile_id());

create or replace function task_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.project_id is null or new.asana_gid is not null then return new; end if;
  if tg_op = 'INSERT' then
    select coalesce(full_name, email) into who from profiles where id = new.assignee_id;
    insert into project_events (project_id, kind, body, created_by)
    values (new.project_id, 'note', 'Added task “' || new.name || '”' || coalesce(' — assigned to ' || who, ''), new.created_by);
  elsif new.completed and not old.completed then
    insert into project_events (project_id, kind, body, created_by)
    values (new.project_id, 'note', 'Completed task “' || new.name || '”', coalesce(my_profile_id(), new.assignee_id));
  elsif new.assignee_id is distinct from old.assignee_id then
    select coalesce(full_name, email) into who from profiles where id = new.assignee_id;
    insert into project_events (project_id, kind, body, created_by)
    values (new.project_id, 'note', 'Reassigned task “' || new.name || '” to ' || coalesce(who, 'nobody'), coalesce(my_profile_id(), new.created_by));
  end if;
  return new;
end $$;

create trigger t_task_history after insert or update on tasks
  for each row execute function task_history();

revoke execute on function task_history() from public, anon, authenticated;
