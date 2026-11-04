-- ==========================================================================
-- Applied 2026-11-04 to project ookiupgocavjbxcxquwl.
-- Leads → "Recommended by tender insights": one row per organisation, ranked
-- from the tender data by the lead-intel function, with Claude's explanation
-- and what Lusha returned. Leads pulled from Lusha point back to it.
-- ==========================================================================

create table if not exists public.lead_intel (
  id uuid primary key default gen_random_uuid(),
  org_key text not null unique,
  agency text not null,
  name_en text,
  domain text,
  sector text,
  rank integer,
  score numeric,
  signals jsonb not null default '{}',
  top_tenders jsonb not null default '[]',
  insight_en text, insight_ar text, angle_en text, angle_ar text,
  lusha_checked_at timestamptz,
  contacts_found integer,
  leads_added integer not null default 0,
  lusha_note text,
  dismissed boolean not null default false,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists lead_intel_rank on public.lead_intel (rank);

alter table public.lead_intel enable row level security;
-- Read by whoever works leads or tenders; the function writes with the service role.
create policy li_read on public.lead_intel for select using (can_sell() or etimad_access());
-- Sales can dismiss or correct an organisation's English name / domain.
create policy li_update on public.lead_intel for update using (can_sell()) with check (can_sell());

alter table public.leads add column if not exists intel_id uuid references public.lead_intel(id) on delete set null;
alter table public.leads add column if not exists lusha_id text;
alter table public.leads add column if not exists linkedin text;
create unique index if not exists leads_lusha_id on public.leads (lusha_id) where lusha_id is not null;
