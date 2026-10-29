-- ==========================================================================
-- Applied 2026-10-29 to project ookiupgocavjbxcxquwl.
-- HR → employee → "Delete employee record": for a record entered by mistake
-- or twice, so it can be added again cleanly.
--
-- What goes: the whole HR file — employment and private details, documents,
-- attendance, leave, requests, salary, advances, draft payslips, goals,
-- letters and 1:1 notes. A hiring request that created the record goes back
-- to "approved", so it can be marked as hired again.
--
-- The person goes too when they have never signed in and are not attached to
-- any work (projects, stages, tasks, leads, files…): their profile, pending
-- invitation and unused login. Anybody who has signed in, or whose name is on
-- real work, keeps their profile — remove them from People instead.
--
-- Refused: deleting yourself, and anyone paid in an approved payroll run
-- (those payslips are locked; mark the person as Left instead).
-- The storage paths of deleted files are returned so the page can remove them.
-- ==========================================================================

create or replace function public.hr_delete_employee(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  p profiles;
  v_paths text[];
  v_profile_deleted boolean := false;
  v_reason text;
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_id = my_profile_id() then raise exception 'cannot_delete_self'; end if;
  select * into p from profiles where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from hr_payslips s join hr_payroll_runs r on r.id = s.run_id
             where s.employee_id = p_id and r.status <> 'draft') then
    raise exception 'has_payroll';
  end if;

  select coalesce(array_agg(path), '{}') into v_paths from (
    select path from hr_documents where employee_id = p_id and path is not null
    union all select id_doc_path from hr_employee_private where profile_id = p_id and id_doc_path is not null
  ) x;

  delete from hr_payslips where employee_id = p_id;
  delete from hr_advances where employee_id = p_id;
  delete from hr_salaries where employee_id = p_id;
  delete from hr_attendance where employee_id = p_id;
  delete from hr_leaves where employee_id = p_id;
  delete from hr_requests where employee_id = p_id;
  delete from hr_goals where employee_id = p_id;
  delete from hr_letters where employee_id = p_id;
  delete from hr_one_on_ones where employee_id = p_id;
  delete from hr_documents where employee_id = p_id;
  delete from hr_employee_private where profile_id = p_id;
  delete from hr_employees where profile_id = p_id;
  update hr_hiring_requests set status = 'approved', hired_profile_id = null, updated_at = now()
   where hired_profile_id = p_id;

  if p.user_id is null then
    begin
      delete from profiles where id = p_id;
      v_profile_deleted := true;
    exception when foreign_key_violation then
      v_reason := 'linked_to_work';
    end;
    if v_profile_deleted and nullif(trim(p.email), '') is not null then
      delete from invitations where lower(email) = lower(trim(p.email)) and accepted_at is null;
      delete from auth.users where lower(email) = lower(trim(p.email)) and last_sign_in_at is null;
    end if;
  else
    v_reason := 'has_login';
  end if;

  return jsonb_build_object('profile_deleted', v_profile_deleted, 'kept_reason', v_reason, 'paths', to_jsonb(v_paths));
end;
$function$;

revoke all on function public.hr_delete_employee(uuid) from public, anon;
grant execute on function public.hr_delete_employee(uuid) to authenticated;
