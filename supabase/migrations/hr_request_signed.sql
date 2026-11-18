-- ==========================================================================
-- The signed paper copy of a request.
--
-- A leave (or any) request is printed from the app, signed by the employee,
-- the manager and HR, and the signed scan goes back on the request, so the
-- employee file has the paper as well as the record.
--
-- The scan lives in the private hr bucket under requests/<employee>/, where
-- the employee and HR can already upload and read. Who may attach it: HR, or
-- the employee on their own request. A cancelled request takes none.
-- ==========================================================================

alter table hr_requests
  add column if not exists signed_path text,
  add column if not exists signed_name text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_by uuid references profiles(id);

create or replace function hr_request_signed(p_id uuid, p_path text, p_name text default null)
returns hr_requests language plpgsql security definer set search_path = public as $$
declare
  r hr_requests;
  me uuid := my_profile_id();
begin
  select * into r from hr_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if me is null or not is_active_user() or not (is_hr() or r.employee_id = me) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status = 'cancelled' then raise exception 'cancelled'; end if;
  if p_path is null or p_path not like 'requests/' || r.employee_id::text || '/%' then
    raise exception 'bad_path';
  end if;
  update hr_requests set signed_path = p_path, signed_name = left(coalesce(p_name, 'signed'), 200),
         signed_at = now(), signed_by = me, updated_at = now()
   where id = p_id returning * into r;
  return r;
end $$;

revoke execute on function hr_request_signed(uuid, text, text) from public, anon;
grant execute on function hr_request_signed(uuid, text, text) to authenticated;
