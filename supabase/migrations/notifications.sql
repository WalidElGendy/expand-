-- ==========================================================================
-- Assignment notifications.
--
-- Whoever is given something to do hears about it straight away: a pop-up
-- at the top of the app, live if they have it open, waiting for them the
-- next time they open it if not. Raised for
--   · a task (on a project, on a lead, or on its own) assigned or reassigned
--     to someone,
--   · a person added to a project's team stage (directly, or by being made
--     the stage's assignee, which adds them as a member),
--   · a pricing line assigned to someone.
-- Nobody is told about something they assigned to themselves, about tasks
-- imported from Asana, or about tasks already done.
--
-- Rows are written only by the triggers here (security definer); each person
-- can read their own and mark them read, nothing else. The text is built in
-- the browser from `data`, so it shows in the reader's language.
-- ==========================================================================

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                      -- task | lead_task | stage | pricing
  data jsonb not null default '{}'::jsonb,
  route text,                              -- where "Open" goes, e.g. #/p/<id>
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_inbox
  on notifications (recipient_id, created_at desc) where read_at is null;

alter table notifications enable row level security;
drop policy if exists notif_read on notifications;
create policy notif_read on notifications for select
  using (recipient_id = my_profile_id());
drop policy if exists notif_mark on notifications;
create policy notif_mark on notifications for update
  using (recipient_id = my_profile_id()) with check (recipient_id = my_profile_id());
-- Marking read is the only change a person can make.
revoke all on notifications from anon, authenticated;
grant select on notifications to authenticated;
grant update (read_at) on notifications to authenticated;

-- Live delivery to the open app.
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

/* One notification, unless it is to yourself or to someone inactive. */
create or replace function notify_assignment(p_to uuid, p_kind text, p_data jsonb, p_route text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := my_profile_id(); actor text;
begin
  if p_to is null or p_to is not distinct from me then return; end if;
  if not exists (select 1 from profiles where id = p_to and is_active) then return; end if;
  select coalesce(full_name, email) into actor from profiles where id = me;
  insert into notifications (recipient_id, kind, data, route, actor_id)
  values (p_to, p_kind, jsonb_strip_nulls(p_data || jsonb_build_object('by', actor)), p_route, me);
end $$;
revoke execute on function notify_assignment(uuid, text, jsonb, text) from public, anon, authenticated;

/* Tasks: on creation with an assignee, and whenever the assignee changes. */
create or replace function tasks_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; lname text;
begin
  if new.asana_gid is not null or new.assignee_id is null or new.completed then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;
  if new.project_id is not null then select name into pname from projects where id = new.project_id; end if;
  if new.lead_id is not null then
    select name || coalesce(' · ' || nullif(company, ''), '') into lname from leads where id = new.lead_id;
  end if;
  perform notify_assignment(new.assignee_id,
    case when new.lead_id is not null then 'lead_task' else 'task' end,
    jsonb_build_object('task', new.name, 'project', pname, 'lead', lname, 'due', new.due_on, 'task_id', new.id),
    case when new.project_id is not null then '#/p/' || new.project_id
         when new.lead_id is not null then '#/l/' || new.lead_id
         else '#/tasks' end);
  return new;
end $$;
revoke execute on function tasks_notify() from public, anon, authenticated;
drop trigger if exists t_tasks_notify on tasks;
create trigger t_tasks_notify after insert or update of assignee_id on tasks
  for each row execute function tasks_notify();

/* Team stages: a person added to the stage. */
create or replace function stage_members_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare st record; pname text;
begin
  select project_id, department_id, planned_end, status into st from project_stages where id = new.stage_id;
  if st.project_id is null or st.status = 'done' then return new; end if;
  select name into pname from projects where id = st.project_id;
  perform notify_assignment(new.profile_id, 'stage',
    jsonb_build_object('project', pname, 'dept', st.department_id, 'due', st.planned_end),
    '#/p/' || st.project_id);
  return new;
end $$;
revoke execute on function stage_members_notify() from public, anon, authenticated;
drop trigger if exists t_stage_members_notify on stage_members;
create trigger t_stage_members_notify after insert on stage_members
  for each row execute function stage_members_notify();

/* Pricing lines: assigned or reassigned. */
create or replace function pricing_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.assignee_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then return new; end if;
  select name into pname from projects where id = new.project_id;
  perform notify_assignment(new.assignee_id, 'pricing',
    jsonb_build_object('item', nullif(new.name, ''), 'project', pname), '#/p/' || new.project_id);
  return new;
end $$;
revoke execute on function pricing_notify() from public, anon, authenticated;
drop trigger if exists t_pricing_notify on pricing_items;
create trigger t_pricing_notify after insert or update of assignee_id on pricing_items
  for each row execute function pricing_notify();
