-- ==========================================================================
-- Applied 2026-10-26 to project ookiupgocavjbxcxquwl.
-- Several people per team stage.
--
-- project_stages.assignee_id stays the stage's main person (the scheduler,
-- workload and estimates count it). stage_members lists everyone on the
-- stage; a trigger keeps the main person in it. Planners, and a team's own
-- lead/manager, staff stages; any member can update the stage they're on.
-- Existing assignees were copied in as members.
-- ==========================================================================

create table if not exists stage_members (
  stage_id uuid not null references project_stages(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (stage_id, profile_id)
);
create index if not exists stage_members_profile on stage_members(profile_id);
alter table stage_members enable row level security;

create or replace function can_staff_stage(p_stage uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_plan() or exists (
    select 1 from project_stages s
     where s.id = p_stage and s.department_id = my_dept()
       and my_role() = any (array['lead','manager','admin']::app_role[]))
$$;

create or replace function is_stage_member(p_stage uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stage_members where stage_id = p_stage and profile_id = my_profile_id())
$$;

create policy sm_read   on stage_members for select using (is_active_user());
create policy sm_insert on stage_members for insert with check (can_staff_stage(stage_id));
create policy sm_delete on stage_members for delete using (can_staff_stage(stage_id));

create policy stage_member_update on project_stages for update
  using (is_stage_member(id)) with check (is_stage_member(id));

create or replace function stage_assignee_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into stage_members (stage_id, profile_id, created_by) values (new.id, new.assignee_id, my_profile_id())
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger t_stage_assignee_member after insert or update of assignee_id on project_stages
  for each row execute function stage_assignee_member();

-- one-off backfill:
-- insert into stage_members (stage_id, profile_id)
--   select id, assignee_id from project_stages where assignee_id is not null on conflict do nothing;

revoke execute on function can_staff_stage(uuid), is_stage_member(uuid) from public, anon;
revoke execute on function stage_assignee_member() from public, anon, authenticated;
