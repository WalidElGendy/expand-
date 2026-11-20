-- ==========================================================================
-- Neo AI — the assistant that leads the twelve agents.
--
-- One row per request a person gives Neo: which agents took it, the report
-- they produced, and where it ran ("local:<model>" on the person's own PC
-- through Ollama, or "claude" through the network). Private to the person
-- who asked: nobody else, admins included, reads someone's Neo history.
-- Network runs are written by the neo function (service role) after it has
-- checked who is asking; local runs are written by the browser itself.
-- ==========================================================================

create table if not exists neo_tasks (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references profiles(id) on delete cascade,
  agents      text[] not null default '{}',
  title       text not null default '',
  prompt      text not null check (length(prompt) between 1 and 4000),
  status      text not null default 'done' check (status in ('working', 'done', 'failed')),
  result      text check (result is null or length(result) <= 60000),
  model       text not null default 'claude' check (length(model) <= 80),
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists neo_tasks_owner on neo_tasks (owner, created_at desc);

alter table neo_tasks enable row level security;
drop policy if exists "neo: own tasks" on neo_tasks;
create policy "neo: own tasks" on neo_tasks for select to authenticated
  using (owner = (select my_profile_id()) and (select is_active_user()));
drop policy if exists "neo: add own" on neo_tasks;
create policy "neo: add own" on neo_tasks for insert to authenticated
  with check (owner = (select my_profile_id()) and (select is_active_user()));
drop policy if exists "neo: update own" on neo_tasks;
create policy "neo: update own" on neo_tasks for update to authenticated
  using (owner = (select my_profile_id())) with check (owner = (select my_profile_id()));
drop policy if exists "neo: delete own" on neo_tasks;
create policy "neo: delete own" on neo_tasks for delete to authenticated
  using (owner = (select my_profile_id()));
