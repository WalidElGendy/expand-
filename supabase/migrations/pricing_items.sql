-- ==========================================================================
-- Applied 2026-10-19 to project ookiupgocavjbxcxquwl.
-- Pricing on the project page.
--
-- The pricing team opens a project and builds its price: item lines
-- (quantity × unit price) and the pricing sheet itself as a file (Excel,
-- PDF, Word). Planners, leads, managers and admins can do the same; everyone
-- active can read it.
-- ==========================================================================

-- run on its own first (an enum value cannot be added inside a transaction
-- that then uses it):
-- alter type file_purpose add value if not exists 'pricing';

create or replace function can_price() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where user_id = auth.uid()), false)
     and (can_plan() or my_dept() = 'pricing'
          or my_role() = any (array['lead','manager','admin']::app_role[]))
$$;

create table if not exists pricing_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null default '',
  description text,
  qty numeric not null default 1 check (qty >= 0),
  unit text,
  unit_price_sar numeric check (unit_price_sar is null or unit_price_sar >= 0),
  sort integer not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pricing_items_project on pricing_items(project_id, sort);

drop trigger if exists t_pricing_touch on pricing_items;
create trigger t_pricing_touch before update on pricing_items
  for each row execute function touch_updated_at();

alter table pricing_items enable row level security;
create policy pricing_read   on pricing_items for select using (is_active_user());
create policy pricing_insert on pricing_items for insert with check (can_price());
create policy pricing_update on pricing_items for update using (can_price()) with check (can_price());
create policy pricing_delete on pricing_items for delete using (can_price());

-- Pricing sheets: files with purpose 'pricing', stored in the docs bucket.
-- A separate permissive policy (policies OR together), so the existing
-- file_insert rule is left exactly as it was.
create policy file_insert_pricing on files for insert
  with check (purpose = 'pricing' and can_price());

create policy "storage write pricing" on storage.objects for insert
  with check (bucket_id = 'docs' and can_price());

-- Applied one statement at a time: run as a single batch the storage policy
-- waits on a lock and the whole migration times out.
-- revoke execute on function can_price() from public, anon;
