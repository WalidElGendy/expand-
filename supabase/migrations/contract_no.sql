-- ==========================================================================
-- Applied 2026-10-29 to project ookiupgocavjbxcxquwl.
-- Employment contract number (e.g. the Qiwa contract number): entered on the
-- hiring request, carried onto the employee file when they are hired, and
-- editable on the employee's Job & contract section.
-- ==========================================================================

alter table hr_hiring_requests add column if not exists contract_no text;
alter table hr_employees add column if not exists contract_no text;

create or replace function public.hr_hire(p_request uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r hr_hiring_requests;
  v_profile uuid;
  v_me uuid := my_profile_id();
begin
  if not is_hr() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from hr_hiring_requests where id = p_request for update;
  if not found then raise exception 'request_not_found'; end if;
  if r.status = 'hired' then return r.hired_profile_id; end if;
  if r.status <> 'approved' then raise exception 'request_not_approved'; end if;

  if nullif(trim(r.email), '') is not null then
    select id into v_profile from profiles where lower(email) = lower(trim(r.email)) limit 1;
  end if;
  if v_profile is null then
    insert into profiles (email, full_name, department_id, role, is_active)
    values (lower(nullif(trim(r.email), '')), r.full_name, r.department_id, 'member', false)
    returning id into v_profile;
  end if;

  insert into hr_employees (profile_id, phone, contract_no, joining_date, position, job_description, employment_status, updated_by)
  values (v_profile, r.phone, r.contract_no, r.joining_date, r.position, r.job_description, 'probation', v_me)
  on conflict (profile_id) do update set
    phone = coalesce(excluded.phone, hr_employees.phone),
    contract_no = coalesce(excluded.contract_no, hr_employees.contract_no),
    joining_date = coalesce(excluded.joining_date, hr_employees.joining_date),
    position = coalesce(excluded.position, hr_employees.position),
    job_description = coalesce(excluded.job_description, hr_employees.job_description),
    updated_at = now(), updated_by = excluded.updated_by;

  insert into hr_employee_private (profile_id, national_id, id_doc_path, id_doc_name, updated_by)
  values (v_profile, r.national_id, r.id_doc_path, r.id_doc_name, v_me)
  on conflict (profile_id) do update set
    national_id = coalesce(excluded.national_id, hr_employee_private.national_id),
    id_doc_path = coalesce(excluded.id_doc_path, hr_employee_private.id_doc_path),
    id_doc_name = coalesce(excluded.id_doc_name, hr_employee_private.id_doc_name),
    updated_at = now(), updated_by = excluded.updated_by;

  update hr_hiring_requests
     set status = 'hired', hired_profile_id = v_profile,
         decided_by = coalesce(decided_by, v_me), decided_at = coalesce(decided_at, now()),
         updated_at = now()
   where id = p_request;
  return v_profile;
end;
$function$;
