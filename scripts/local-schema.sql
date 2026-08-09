-- =========================================================================
-- A local mirror of the tables the Asana import writes to, for validating
-- generated SQL before it touches the real database.
--
-- This exists because two generator bugs in a row were each found by a
-- round trip to production: one syntax error, one missing cast. Both would
-- have been caught in seconds against any Postgres. Auth, storage and RLS
-- are deliberately absent — they are not what the import exercises.
--
--   pg_ctl start ... && psql -f scripts/local-schema.sql && psql -f import-*.sql
-- =========================================================================

drop schema if exists public cascade;
create schema public;

create extension if not exists "pgcrypto";

create type app_role        as enum ('member','lead','manager','admin');
create type size_band       as enum ('S','M','L','XL');
create type project_status  as enum ('intake','in_design','pricing','submitted','won','lost','delivered','archived');
create type stage_status    as enum ('pending','in_progress','blocked','done');
create type lead_status     as enum ('new','contacted','qualified','proposal','won','lost');
create type file_purpose    as enum ('rfp','reference','document');
create type lead_event_kind as enum ('note','call','email','meeting','status_change');

create table departments (
  id text primary key, name_en text not null, name_ar text not null,
  colour text not null default '#915bf5', base_days numeric,
  is_stage boolean not null default false, sort int not null default 0
);
insert into departments (id, name_en, name_ar, base_days, is_stage, sort) values
  ('pm','Project management','إدارة المشاريع',null,false,1),
  ('3d','3D design','التصميم ثلاثي الأبعاد',5,true,2),
  ('2d','2D technical','الرسومات الفنية',2,true,3),
  ('content','Content creation','إنتاج المحتوى',3,true,4),
  ('pricing','Pricing & financial','التسعير والمالية',null,true,5),
  ('bd','Business development','تطوير الأعمال',null,false,6),
  ('production','Production','التنفيذ',null,true,7);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text unique,
  full_name text,
  department_id text references departments(id),
  role app_role not null default 'member',
  is_active boolean not null default true,
  asana_gid text unique,
  invited_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null, client text, description text,
  size size_band not null default 'M',
  status project_status not null default 'intake',
  start_on date, due_on date, delivered_on date,
  estimated_delivery date, estimate_meta jsonb,
  owner_id uuid references profiles(id), created_by uuid references profiles(id),
  asana_gid text unique, asana_url text,
  is_crm_list boolean not null default false,
  import_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_stages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  department_id text not null references departments(id),
  assignee_id uuid references profiles(id),
  effort_days numeric, planned_start date, planned_end date,
  started_at timestamptz, completed_at timestamptz,
  status stage_status not null default 'pending',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, department_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  stage_id uuid references project_stages(id) on delete set null,
  name text not null, notes text,
  assignee_id uuid references profiles(id),
  section_name text, due_on date,
  completed boolean not null default false, completed_at timestamptz,
  asana_gid text unique, asana_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, company text, email text, phone text,
  status lead_status not null default 'new',
  source text, owner_id uuid references profiles(id),
  next_follow_up_on date, value_sar numeric, notes text,
  asana_gid text unique, created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  kind lead_event_kind not null default 'note',
  body text, occurred_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  purpose file_purpose not null,
  project_id uuid references projects(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  title text, description text,
  department_id text references departments(id),
  bucket text not null, path text not null unique,
  filename text not null, mime text, size_bytes bigint,
  uploaded_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
