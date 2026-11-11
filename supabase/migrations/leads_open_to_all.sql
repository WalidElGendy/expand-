-- ==========================================================================
-- Applied 2026-11-11 to project ookiupgocavjbxcxquwl.
-- Anyone active can add a lead.
--
-- Leads were writable only by can_sell() (admins, managers, Business
-- development), but the Leads page offers "New lead" to everyone — so a
-- project manager adding one got "new row violates row-level security policy
-- for table leads". Now:
--   * any active user can add a lead, recorded as created by themselves;
--   * the person who added or owns a lead can update it and log notes on it;
--   * sellers keep full access; deleting stays admin-only.
-- ==========================================================================

alter policy lead_write on leads
  with check (can_sell() or (is_active_user() and created_by = my_profile_id()));

alter policy lead_update on leads
  using (can_sell() or owner_id = my_profile_id() or created_by = my_profile_id())
  with check (can_sell() or owner_id = my_profile_id() or created_by = my_profile_id());

alter policy levent_write on lead_events
  with check (can_sell() or exists (
    select 1 from leads l
     where l.id = lead_events.lead_id
       and (l.owner_id = my_profile_id() or l.created_by = my_profile_id())));
