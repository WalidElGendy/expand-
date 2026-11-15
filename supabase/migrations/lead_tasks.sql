-- ==========================================================================
-- Assign an action on a lead to a colleague.
--
-- Posting in a lead's Activity can now hand the next step to someone else
-- ("call them back by Thursday" → Sara). It is an ordinary task with a
-- lead_id instead of a project_id, so it shows up under the assignee's
-- My tasks and on Home, is ticked off the same way, and keeps the same
-- update rules (assignee, creator, planners, leads, managers, admins).
--
-- The lead's Activity records it: who it was given to and by when, when it
-- was done and by whom, and any reassignment. The assignee can also post on
-- that lead's Activity, so they can say what happened.
-- ==========================================================================

alter table tasks add column if not exists lead_id uuid references leads(id) on delete cascade;
create index if not exists tasks_lead_idx on tasks (lead_id) where lead_id is not null;

-- Any active colleague may give an action on a lead, as themselves.
drop policy if exists task_insert_lead on tasks;
create policy task_insert_lead on tasks for insert
  with check (is_active_user() and lead_id is not null and project_id is null
              and created_by = my_profile_id());

-- Whoever holds an action on a lead may log on that lead's Activity.
drop policy if exists levent_write_assignee on lead_events;
create policy levent_write_assignee on lead_events for insert
  with check (is_active_user() and created_by = my_profile_id() and exists (
    select 1 from tasks t where t.lead_id = lead_events.lead_id and t.assignee_id = my_profile_id()));

-- The project branch is unchanged; the lead branch is new.
create or replace function task_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.asana_gid is not null then return new; end if;

  if new.lead_id is not null then
    if tg_op = 'INSERT' then
      select coalesce(full_name, email) into who from profiles where id = new.assignee_id;
      insert into lead_events (lead_id, kind, body, created_by)
      values (new.lead_id, 'note',
              'Assigned to ' || coalesce(who, 'nobody')
              || coalesce(' · due ' || to_char(new.due_on, 'DD Mon YYYY'), '')
              || ': ' || new.name, new.created_by);
    elsif new.completed and not old.completed then
      insert into lead_events (lead_id, kind, body, created_by)
      values (new.lead_id, 'note', 'Done: ' || new.name, coalesce(my_profile_id(), new.assignee_id));
    elsif old.completed and not new.completed then
      insert into lead_events (lead_id, kind, body, created_by)
      values (new.lead_id, 'note', 'Reopened: ' || new.name, coalesce(my_profile_id(), new.created_by));
    elsif new.assignee_id is distinct from old.assignee_id then
      select coalesce(full_name, email) into who from profiles where id = new.assignee_id;
      insert into lead_events (lead_id, kind, body, created_by)
      values (new.lead_id, 'note', 'Reassigned to ' || coalesce(who, 'nobody') || ': ' || new.name,
              coalesce(my_profile_id(), new.created_by));
    end if;
    return new;
  end if;

  if new.project_id is null then return new; end if;
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

revoke execute on function task_history() from public, anon, authenticated;
