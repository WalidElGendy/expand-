-- ==========================================================================
-- Applied 2026-11-01 to project ookiupgocavjbxcxquwl.
-- HR → People → Import from Excel: the report's department and manager go
-- on the person's profile. Profiles are otherwise written by admins only, so
-- HR gets exactly these two columns through this function and nothing more.
-- ==========================================================================

create or replace function public.hr_set_org(
  p_id uuid, p_department text default null, p_supervisor uuid default null,
  p_set_department boolean default false, p_set_supervisor boolean default false)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not is_hr() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_set_supervisor and p_supervisor = p_id then raise exception 'own_manager'; end if;
  if p_set_department and p_department is not null
     and not exists (select 1 from departments where id = p_department) then
    raise exception 'unknown_department';
  end if;
  update profiles set
    department_id = case when p_set_department then p_department else department_id end,
    supervisor_id = case when p_set_supervisor then p_supervisor else supervisor_id end,
    updated_at    = now()
  where id = p_id;
  if not found then raise exception 'not_found'; end if;
end $function$;

revoke all on function public.hr_set_org(uuid, text, uuid, boolean, boolean) from public, anon;
grant execute on function public.hr_set_org(uuid, text, uuid, boolean, boolean) to authenticated;
