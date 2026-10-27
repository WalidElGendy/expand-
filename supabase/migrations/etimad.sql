-- ==========================================================================
-- Etimad Insights: public tenders from Etimad (through Firecrawl), their
-- analysis (Claude), the agency's contacts (Lusha) and how our own bids end.
--
--   etimad_settings   one row: search words, our company profile for the AI,
--                     the Firecrawl tool catalogue, last sync
--   etimad_tenders    one row per Etimad tender seen by a sync
--   etimad_analyses   every AI analysis of a tender (newest wins on screen)
--   etimad_contacts   people at the issuing agency found through Lusha
--   etimad_files      RFP booklets we downloaded from Etimad and uploaded here
--   etimad_usage      what each call to a paid API cost, for the settings page
--   tender_outcomes   what happened to a tender we applied for: submitted,
--                     won or lost, our price and the winner's
--
-- Who: tender staff (analysts, approvers, admins). The API keys never reach
-- the browser — the `etimad` edge function holds them as secrets and writes
-- the rows the browser cannot (analyses, contacts, synced tenders).
-- ==========================================================================

create table if not exists etimad_settings (
  id int primary key default 1 check (id = 1),
  keywords text[] not null default array[
    'معرض','معارض','جناح','أجنحة','فعاليات','فعالية','مؤتمر','ملتقى','منتدى','حفل',
    'تنظيم فعاليات','تجهيز','تأثيث','ديكورات','متحف','هوية بصرية','لوحات','تسويق','حملة إعلانية'],
  scopes text[] not null default array['stands','events','fitout','marketing'],
  company_profile text,
  tools jsonb,
  last_sync_at timestamptz,
  last_sync_note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
insert into etimad_settings (id) values (1) on conflict (id) do nothing;

create table if not exists etimad_tenders (
  id uuid primary key default gen_random_uuid(),
  tender_id_string text not null unique,
  tender_number text,
  reference_number text,
  name text not null default '',
  agency text,
  agency_en text,
  agency_domain text,
  tender_type text,
  status text,
  activity text,
  regions text[] not null default '{}',
  published_on date,
  last_offer_at timestamptz,
  opening_at timestamptz,
  expected_award_on date,
  documents_price numeric,
  est_value_sar numeric,
  contract_duration text,
  source_url text,
  scopes text[] not null default '{}',
  keyword_hits text[] not null default '{}',
  summary jsonb,
  details jsonb,
  details_at timestamptz,
  awards jsonb not null default '[]'::jsonb,
  shortlisted boolean not null default false,
  dismissed boolean not null default false,
  note text,
  tender_id uuid references tenders(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists etimad_tenders_offer on etimad_tenders(last_offer_at);
create index if not exists etimad_tenders_agency on etimad_tenders(agency);

create table if not exists etimad_analyses (
  id uuid primary key default gen_random_uuid(),
  etimad_tender_id uuid not null references etimad_tenders(id) on delete cascade,
  result jsonb not null,
  model text,
  files text[] not null default '{}',
  input_tokens int,
  output_tokens int,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists etimad_analyses_t on etimad_analyses(etimad_tender_id, created_at desc);

create table if not exists etimad_contacts (
  id uuid primary key default gen_random_uuid(),
  etimad_tender_id uuid references etimad_tenders(id) on delete set null,
  agency text,
  lusha_id text not null,
  full_name text,
  job_title text,
  company text,
  company_domain text,
  country text,
  linkedin text,
  emails jsonb not null default '[]'::jsonb,
  phones jsonb not null default '[]'::jsonb,
  can_reveal jsonb,
  revealed_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lusha_id)
);
create index if not exists etimad_contacts_agency on etimad_contacts(agency);

create table if not exists etimad_files (
  id uuid primary key default gen_random_uuid(),
  etimad_tender_id uuid not null references etimad_tenders(id) on delete cascade,
  path text not null,
  file_name text not null,
  size_bytes bigint,
  mime text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists etimad_usage (
  id uuid primary key default gen_random_uuid(),
  service text not null check (service in ('firecrawl','claude','lusha')),
  action text,
  units numeric,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tender_outcomes (
  tender_id uuid primary key references tenders(id) on delete cascade,
  bid_status text not null default 'preparing'
    check (bid_status in ('preparing','submitted','won','lost','cancelled','not_submitted')),
  submitted_on date,
  our_price_sar numeric check (our_price_sar is null or our_price_sar >= 0),
  winner text,
  winning_price_sar numeric check (winning_price_sar is null or winning_price_sar >= 0),
  bidders int check (bidders is null or bidders >= 0),
  lost_reason text,
  notes text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------ RLS
alter table etimad_settings enable row level security;
alter table etimad_tenders enable row level security;
alter table etimad_analyses enable row level security;
alter table etimad_contacts enable row level security;
alter table etimad_files enable row level security;
alter table etimad_usage enable row level security;
alter table tender_outcomes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'etimad_settings' and policyname = 'ets_read') then
    create policy ets_read on etimad_settings for select to authenticated using (tender_staff());
    create policy ets_write on etimad_settings for update to authenticated using (tender_approver()) with check (tender_approver());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'etimad_tenders' and policyname = 'ett_read') then
    create policy ett_read on etimad_tenders for select to authenticated using (tender_staff());
    create policy ett_update on etimad_tenders for update to authenticated using (tender_staff()) with check (tender_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'etimad_analyses' and policyname = 'eta_read') then
    create policy eta_read on etimad_analyses for select to authenticated using (tender_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'etimad_contacts' and policyname = 'etc_read') then
    create policy etc_read on etimad_contacts for select to authenticated using (tender_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'etimad_files' and policyname = 'etf_read') then
    create policy etf_read on etimad_files for select to authenticated using (tender_staff());
    create policy etf_insert on etimad_files for insert to authenticated with check (tender_staff());
    create policy etf_delete on etimad_files for delete to authenticated using (tender_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'etimad_usage' and policyname = 'etu_read') then
    create policy etu_read on etimad_usage for select to authenticated using (tender_staff());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tender_outcomes' and policyname = 'tout_read') then
    create policy tout_read on tender_outcomes for select to authenticated using (tender_visible(tender_id));
    create policy tout_insert on tender_outcomes for insert to authenticated with check (tender_visible(tender_id));
    create policy tout_update on tender_outcomes for update to authenticated using (tender_visible(tender_id)) with check (tender_visible(tender_id));
  end if;
end $$;

-- Only the shortlist / dismiss / note / link columns are the browser's to
-- change; everything else on a synced tender comes from Etimad.
create or replace function etimad_tenders_before() returns trigger
language plpgsql set search_path = public as $$
declare keep_s boolean := new.shortlisted; keep_d boolean := new.dismissed; keep_n text := new.note;
        keep_t uuid := new.tender_id; keep_dom text := new.agency_domain; keep_en text := new.agency_en;
begin
  if current_user = 'authenticated' then
    new := old;
    new.shortlisted := keep_s; new.dismissed := keep_d; new.note := keep_n; new.tender_id := keep_t;
    new.agency_domain := keep_dom; new.agency_en := keep_en;
  end if;
  new.updated_at := now();
  return new;
end $$;
create or replace trigger t_etimad_tenders_before before update on etimad_tenders
  for each row execute function etimad_tenders_before();

create or replace function tender_outcomes_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_by := coalesce(my_profile_id(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create or replace trigger t_tender_outcomes_before before insert or update on tender_outcomes
  for each row execute function tender_outcomes_before();

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('etimad', 'etimad', false, 209715200) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'etimad read') then
    create policy "etimad read" on storage.objects for select to authenticated using (bucket_id = 'etimad' and tender_staff());
    create policy "etimad write" on storage.objects for insert to authenticated with check (bucket_id = 'etimad' and tender_staff());
    create policy "etimad delete" on storage.objects for delete to authenticated using (bucket_id = 'etimad' and tender_staff());
  end if;
end $$;
