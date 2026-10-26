-- ==========================================================================
-- Applied 2026-10-26 to project ookiupgocavjbxcxquwl.
-- A Tenders department, and tender roles on the People page.
--
-- * People in the Tenders department are tender analysts automatically.
-- * An admin can make anyone an Analyst or an Approver from People (the same
--   lists the Tenders settings page edits), or clear it.
-- ==========================================================================

insert into departments (id, name_en, name_ar, colour, is_stage, sort)
values ('tenders', 'Tenders', 'المناقصات', '#0f9d9a', false, 9)
on conflict (id) do nothing;

create or replace function tender_analyst() returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or coalesce((select my_profile_id() = any(analysts) from tender_settings where id = 1), false)
      or coalesce((select is_active and department_id = 'tenders' from profiles where user_id = auth.uid()), false)
$$;

create or replace function set_tender_role(p_profile uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s tender_settings;
begin
  if not is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_role is not null and p_role not in ('analyst', 'approver') then raise exception 'bad_role'; end if;
  update tender_settings
     set analysts  = array_remove(analysts, p_profile)  || case when p_role = 'analyst'  then array[p_profile] else '{}'::uuid[] end,
         approvers = array_remove(approvers, p_profile) || case when p_role = 'approver' then array[p_profile] else '{}'::uuid[] end,
         updated_at = now(), updated_by = my_profile_id()
   where id = 1 returning * into s;
  return jsonb_build_object('analysts', s.analysts, 'approvers', s.approvers);
end $$;

revoke execute on function set_tender_role(uuid, text) from public, anon;
