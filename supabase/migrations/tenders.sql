-- ==========================================================================
-- Applied 2026-10-18 to project ookiupgocavjbxcxquwl.
-- Tenders: the tender analyst records a tender and its analysis, the
-- Operations Director approves or rejects it, and an approval creates the
-- project for the assigned project manager.
--
--   draft ──send──▶ review ──approve (+PM)──▶ approved  → project created
--     ▲               │  └────reject (+reason)─▶ rejected ──reopen──▶ review
--     └────return─────┘
--
-- Who:
--   · approvers  tender_settings.approvers (Omar Khaled at launch) + admins
--   · analysts   tender_settings.analysts + admins
--   · the assigned project manager sees their own tender
-- Decisions only go through tender_decide(); a trigger refuses any other
-- route to approved/rejected or to the decision columns.
-- ==========================================================================

create table if not exists tender_settings (
  id int primary key default 1 check (id = 1),
  approvers uuid[] not null default '{}',
  analysts uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
insert into tender_settings (id, approvers)
select 1, coalesce(array_agg(id), '{}') from profiles where full_name = 'Omar Khaled' and department_id = 'pricing'
on conflict (id) do nothing;

create or replace function tender_approver() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce((select my_profile_id() = any(approvers) from tender_settings where id = 1), false)
$$;
create or replace function tender_analyst() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or coalesce((select my_profile_id() = any(analysts) from tender_settings where id = 1), false)
$$;
create or replace function tender_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select tender_approver() or tender_analyst()
$$;
create table if not exists tender_counters (year int primary key, last int not null default 0);

create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),
  ref text unique,
  title text not null check (length(btrim(title)) > 0),
  client text not null check (length(btrim(client)) > 0),
  tender_no text,
  source text check (source in ('etimad','direct','email','portal','other')),
  category text,
  location text,
  issued_on date,
  questions_due date,
  site_visit_on date,
  submission_due date,
  value_sar numeric check (value_sar is null or value_sar >= 0),
  client_budget_sar numeric check (client_budget_sar is null or client_budget_sar >= 0),
  bond_sar numeric check (bond_sar is null or bond_sar >= 0),
  scope text,
  requirements jsonb not null default '[]'::jsonb,
  competitors jsonb not null default '[]'::jsonb,
  client_history text,
  risks text,
  summary text,
  recommendation text check (recommendation in ('apply','consider','skip')),
  win_chance int check (win_chance between 0 and 100),
  status text not null default 'draft' check (status in ('draft','review','approved','rejected')),
  analyst_id uuid references profiles(id) on delete set null,
  sent_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  reject_reason text check (reject_reason in ('price','timeline','capacity','scope','requirements',
                                              'competition','client_risk','terms','other')),
  pm_id uuid references profiles(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenders_status on tenders(status);
create index if not exists tenders_client on tenders(lower(btrim(client)));
create index if not exists tenders_pm on tenders(pm_id);

create table if not exists tender_events (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  kind text not null check (kind in ('created','sent','pulled','returned','approved','rejected','reopened','reassigned','note')),
  body text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists tender_events_t on tender_events(tender_id, created_at desc);

create table if not exists tender_files (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  kind text not null default 'other' check (kind in ('rfp','boq','drawings','award','other')),
  path text not null,
  file_name text not null,
  size_bytes bigint,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function tender_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select tender_staff() or exists (select 1 from tenders where id = p_id and pm_id = my_profile_id())
$$;

-- For the sidebar: what this person may do with tenders.
create or replace function tender_role() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'approver', tender_approver(),
    'analyst', tender_analyst(),
    'assigned', exists (select 1 from tenders where pm_id = my_profile_id()))
$$;


create or replace function tender_visible_path(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then tender_visible(p::uuid) else false end
$$;

-- ------------------------------------------------------------ triggers
create or replace function tenders_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare y int; n int; rpc boolean := coalesce(current_setting('expand.tender_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not rpc and new.status <> 'draft' then new.status := 'draft'; end if;
    new.created_by := coalesce(my_profile_id(), new.created_by);
    new.analyst_id := coalesce(new.analyst_id, new.created_by);
    y := extract(year from now() at time zone 'Asia/Riyadh')::int;
    insert into tender_counters (year, last) values (y, 1)
      on conflict (year) do update set last = tender_counters.last + 1 returning last into n;
    new.ref := 'TND-' || y || '-' || lpad(n::text, 4, '0');
    new.decided_by := null; new.decided_at := null; new.reject_reason := null; new.decision_note := null;
    new.pm_id := null; new.project_id := null;
    return new;
  end if;
  new.updated_at := now();
  new.ref := old.ref; new.created_by := old.created_by; new.created_at := old.created_at;
  if rpc then return new; end if;
  if old.status in ('approved','rejected') then
    raise exception 'tender_decided' using errcode = '42501';
  end if;
  if new.status not in ('draft','review') then
    raise exception 'decision_only_by_approver' using errcode = '42501';
  end if;
  new.decided_by := old.decided_by; new.decided_at := old.decided_at;
  new.reject_reason := old.reject_reason; new.decision_note := old.decision_note;
  new.pm_id := old.pm_id; new.project_id := old.project_id;
  if new.status = 'review' and old.status = 'draft' then new.sent_at := now(); end if;
  return new;
end $$;

create or replace function tenders_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('expand.tender_rpc', true), '') = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    insert into tender_events (tender_id, kind, created_by) values (new.id, 'created', my_profile_id());
  elsif old.status = 'draft' and new.status = 'review' then
    insert into tender_events (tender_id, kind, created_by) values (new.id, 'sent', my_profile_id());
  elsif old.status = 'review' and new.status = 'draft' then
    insert into tender_events (tender_id, kind, created_by) values (new.id, 'pulled', my_profile_id());
  end if;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 't_tenders_before') then
    create trigger t_tenders_before before insert or update on tenders for each row execute function tenders_before();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 't_tenders_after') then
    create trigger t_tenders_after after insert or update on tenders for each row execute function tenders_after();
  end if;
end $$;

-- ------------------------------------------------------------ the decision
create or replace function tender_decide(p_id uuid, p_action text, p_reason text default null,
                                         p_note text default null, p_pm uuid default null)
returns tenders language plpgsql security definer set search_path = public as $$
declare t tenders; me uuid := my_profile_id(); pid uuid; pm profiles; who text;
begin
  if me is null or not tender_approver() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into t from tenders where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select full_name into who from profiles where id = me;
  perform set_config('expand.tender_rpc', 'on', true);

  if p_action = 'approve' then
    if t.status <> 'review' then raise exception 'not_in_review'; end if;
    select * into pm from profiles where id = p_pm and is_active;
    if not found then raise exception 'pm_required'; end if;
    insert into projects (name, client, description, due_on, owner_id, created_by, status, size)
    values (t.title, t.client,
            concat_ws(E'\n\n', 'Tender ' || t.ref || coalesce(' · ' || t.tender_no, ''), nullif(btrim(coalesce(t.scope, '')), '')),
            t.submission_due, p_pm, me, 'intake', 'M')
    returning id into pid;
    insert into project_events (project_id, kind, body, created_by)
    values (pid, 'note', 'Created from tender ' || t.ref || ', approved by ' || coalesce(who, '—')
            || coalesce(E'\n' || nullif(btrim(coalesce(p_note, '')), ''), ''), me);
    update tenders set status = 'approved', decided_by = me, decided_at = now(), decision_note = p_note,
           reject_reason = null, pm_id = p_pm, project_id = pid where id = p_id returning * into t;
    insert into tender_events (tender_id, kind, body, created_by)
    values (p_id, 'approved', concat_ws(' · ', 'PM: ' || pm.full_name, nullif(btrim(coalesce(p_note, '')), '')), me);

  elsif p_action = 'reject' then
    if t.status <> 'review' then raise exception 'not_in_review'; end if;
    if p_reason is null or p_reason not in ('price','timeline','capacity','scope','requirements',
                                            'competition','client_risk','terms','other') then
      raise exception 'reason_required';
    end if;
    update tenders set status = 'rejected', decided_by = me, decided_at = now(), decision_note = p_note,
           reject_reason = p_reason, pm_id = null where id = p_id returning * into t;
    insert into tender_events (tender_id, kind, body, created_by)
    values (p_id, 'rejected', concat_ws(' · ', p_reason, nullif(btrim(coalesce(p_note, '')), '')), me);

  elsif p_action = 'return' then
    if t.status <> 'review' then raise exception 'not_in_review'; end if;
    update tenders set status = 'draft' where id = p_id returning * into t;
    insert into tender_events (tender_id, kind, body, created_by) values (p_id, 'returned', p_note, me);

  elsif p_action = 'reopen' then
    if t.status <> 'rejected' then raise exception 'only_rejected_reopen'; end if;
    update tenders set status = 'review', decided_by = null, decided_at = null, reject_reason = null,
           decision_note = null where id = p_id returning * into t;
    insert into tender_events (tender_id, kind, body, created_by) values (p_id, 'reopened', p_note, me);

  elsif p_action = 'reassign' then
    if t.status <> 'approved' then raise exception 'not_approved'; end if;
    select * into pm from profiles where id = p_pm and is_active;
    if not found then raise exception 'pm_required'; end if;
    update tenders set pm_id = p_pm where id = p_id returning * into t;
    if t.project_id is not null then update projects set owner_id = p_pm where id = t.project_id; end if;
    insert into tender_events (tender_id, kind, body, created_by) values (p_id, 'reassigned', 'PM: ' || pm.full_name, me);
  else
    raise exception 'bad_action';
  end if;
  perform set_config('expand.tender_rpc', 'off', true);
  return t;
end $$;

-- ------------------------------------------------------------ RLS
alter table tender_settings enable row level security;
alter table tenders enable row level security;
alter table tender_events enable row level security;
alter table tender_files enable row level security;
alter table tender_counters enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tender_settings' and policyname = 'tset_read') then
    create policy tset_read on tender_settings for select to authenticated using (is_active_user());
    create policy tset_write on tender_settings for update to authenticated using (is_admin()) with check (is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tenders' and policyname = 'tnd_read') then
    create policy tnd_read on tenders for select to authenticated
      using (tender_staff() or pm_id = (select my_profile_id()));
    create policy tnd_insert on tenders for insert to authenticated with check (tender_analyst());
    create policy tnd_update on tenders for update to authenticated
      using (tender_staff()) with check (tender_staff());
    create policy tnd_delete on tenders for delete to authenticated
      using (is_admin() or (tender_analyst() and status = 'draft'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tender_events' and policyname = 'tev_read') then
    create policy tev_read on tender_events for select to authenticated using (tender_visible(tender_id));
    create policy tev_note on tender_events for insert to authenticated
      with check (kind = 'note' and created_by = (select my_profile_id()) and tender_visible(tender_id));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tender_files' and policyname = 'tfl_read') then
    create policy tfl_read on tender_files for select to authenticated using (tender_visible(tender_id));
    create policy tfl_insert on tender_files for insert to authenticated
      with check (tender_visible(tender_id) and uploaded_by = (select my_profile_id()));
    create policy tfl_delete on tender_files for delete to authenticated
      using (tender_staff() or uploaded_by = (select my_profile_id()));
  end if;
end $$;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('tenders', 'tenders', false, 52428800) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'tenders read') then
    create policy "tenders read" on storage.objects for select to authenticated
      using (bucket_id = 'tenders' and tender_visible_path((storage.foldername(name))[1]));
    create policy "tenders write" on storage.objects for insert to authenticated
      with check (bucket_id = 'tenders' and tender_visible_path((storage.foldername(name))[1]));
    create policy "tenders delete" on storage.objects for delete to authenticated
      using (bucket_id = 'tenders' and tender_staff());
  end if;
end $$;

-- run separately (they hang when batched with DDL through the MCP):
-- revoke execute on function tenders_before() from public, anon, authenticated;
-- revoke execute on function tenders_after() from public, anon, authenticated;
-- revoke execute on function tender_decide(uuid, text, text, text, uuid) from public, anon;
