-- ==========================================================================
-- Applied 2026-11-05 to project ookiupgocavjbxcxquwl.
-- Etimad Insights → Competitors.
--
-- etimad_tenders.awards now also holds the public award results of closed
-- tenders: every bidder, their financial offer, whether their technical offer
-- passed, and who was awarded at what value. awards_at records when they were
-- read (so each tender is read once), awards_note what Etimad said when there
-- were none (not awarded yet, cancelled…).
--
-- etimad_settings.our_names: how Expand appears as a supplier on Etimad, so
-- the competitor pages can show the rounds rivals won against us.
-- ==========================================================================

alter table public.etimad_tenders add column if not exists awards_at timestamptz;
alter table public.etimad_tenders add column if not exists awards_note text;
create index if not exists etimad_tenders_awards_todo on public.etimad_tenders (last_offer_at) where awards_at is null;

alter table public.etimad_settings add column if not exists our_names text[] not null
  default array['اكسباند', 'إكسباند', 'اكسبند', 'expand'];
