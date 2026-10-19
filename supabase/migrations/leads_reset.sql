-- ==========================================================================
-- Applied 2026-10-19 to project ookiupgocavjbxcxquwl.
-- Leads: a clean slate for the sales team.
--
-- The imported statuses, owners and follow-up dates came from Asana sections
-- and did not reflect reality, so every statistic built on them was wrong.
-- The lead records themselves (name, company, contact, source, notes) stay.
-- A full copy of the old values is in expand-backup-2026-10-19.json.
--
-- From today a salesperson PICKS UP a lead (it becomes theirs) and documents
-- every touch in its history.
-- ==========================================================================

-- 1. Data reset (run once).
-- update leads set status = 'new', owner_id = null, next_follow_up_on = null;
-- delete from lead_events where kind = 'status_change' or body like 'Imported from Asana section:%';

-- 2. Pick up a lead. Only an unowned lead, so two people cannot both take
--    the same one; the first click wins and the second gets 'already_taken'.
create or replace function pick_up_lead(p_id uuid) returns leads
language plpgsql security definer set search_path = public as $$
declare me uuid := my_profile_id(); r leads; who text;
begin
  if not can_sell() or me is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  update leads set owner_id = me where id = p_id and owner_id is null returning * into r;
  if r.id is null then
    if exists (select 1 from leads where id = p_id) then raise exception 'already_taken'; end if;
    raise exception 'not_found';
  end if;
  select coalesce(full_name, email) into who from profiles where id = me;
  insert into lead_events (lead_id, kind, body, created_by) values (p_id, 'note', 'Picked up by ' || who, me);
  return r;
end $$;

-- run separately:
-- revoke execute on function pick_up_lead(uuid) from public, anon;
